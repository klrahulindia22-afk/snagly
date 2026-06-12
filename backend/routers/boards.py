import secrets
from datetime import datetime, timedelta, timezone
from fastapi import APIRouter, Depends, HTTPException, status, Query
from models.activity_log import ActivityLog
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update, func, delete
from database import get_db
from config import settings
from models.user import User, UserRole
from models.board import Board
from models.board_membership import BoardMembership
from models.board_activity_log import BoardActivityLog
from models.invite import Invite
from models.share_link import ShareLink
from models.join_request import JoinRequest
from schemas.board import (
    BoardCreate, BoardUpdate, BoardOut, MemberOut, MemberRoleUpdate,
    BoardInviteRequest, InviteAcceptRequest, ShareLinkOut,
    JoinRequestCreate, JoinRequestReview, JoinRequestOut, BoardInviteOut,
)
from schemas.auth import UserOut
from middleware.auth import get_current_user
from services.auth_service import hash_password, create_access_token, create_refresh_token
from services.email_service import send_invite_board_email

router = APIRouter(prefix="/api/v1/boards", tags=["boards"])
invite_router = APIRouter(prefix="/api/v1/invite", tags=["invite"])


# ── helpers ────────────────────────────────────────────────────────────────────

async def _board_membership(board_id: int, user_id: int, db: AsyncSession):
    return await db.scalar(
        select(BoardMembership).where(
            BoardMembership.board_id == board_id,
            BoardMembership.user_id == user_id,
        )
    )


async def _require_board_member(board_id: int, current_user: User, db: AsyncSession):
    board = await db.scalar(select(Board).where(Board.id == board_id, Board.is_archived == False))
    if not board:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Board not found")
    m = await _board_membership(board_id, current_user.id, db)
    if not m:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Not a member of this board")
    return board, m


async def _log(board_id: int, user_id: int, action: str, detail: str, db: AsyncSession):
    db.add(BoardActivityLog(board_id=board_id, user_id=user_id, action=action, detail=detail))


async def _member_count(board_id: int, db: AsyncSession) -> int:
    return await db.scalar(
        select(func.count()).select_from(BoardMembership).where(BoardMembership.board_id == board_id)
    ) or 0


async def _board_out(board: Board, my_role: str, db: AsyncSession) -> dict:
    owner = await db.scalar(select(User).where(User.id == board.owner_id))
    count = await _member_count(board.id, db)
    return BoardOut(
        id=board.id, name=board.name, description=board.description,
        owner_id=board.owner_id, owner_name=owner.full_name if owner else None,
        member_limit=board.member_limit, bg_color=board.bg_color,
        is_archived=board.is_archived, created_at=board.created_at,
        my_role=my_role, member_count=count,
    ).model_dump()


# ── boards CRUD ────────────────────────────────────────────────────────────────

@router.get("")
async def get_my_boards(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Board, BoardMembership.role)
        .join(BoardMembership, Board.id == BoardMembership.board_id)
        .where(BoardMembership.user_id == current_user.id, Board.is_archived == False)
        .order_by(BoardMembership.joined_at.desc())
    )
    rows = result.all()
    data = [await _board_out(board, role.value, db) for board, role in rows]
    return {"data": data, "meta": {"total": len(data)}}


@router.post("", status_code=status.HTTP_201_CREATED)
async def create_board(
    body: BoardCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    board = Board(
        name=body.name,
        description=body.description,
        owner_id=current_user.id,
        bg_color=body.bg_color or "#6c63ff",
        member_limit=body.member_limit or 10,
    )
    db.add(board)
    await db.flush()

    db.add(BoardMembership(board_id=board.id, user_id=current_user.id, role=UserRole.owner))
    await _log(board.id, current_user.id, "board.created", f"Board '{body.name}' created", db)
    await db.commit()
    await db.refresh(board)

    return {"data": await _board_out(board, "owner", db)}


@router.get("/{board_id}")
async def get_board(
    board_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    board, m = await _require_board_member(board_id, current_user, db)
    return {"data": await _board_out(board, m.role.value, db)}


@router.patch("/{board_id}")
async def update_board(
    board_id: int,
    body: BoardUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    board, m = await _require_board_member(board_id, current_user, db)
    if m.role not in (UserRole.owner,):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Only the board owner can update board settings")

    changes = body.model_dump(exclude_none=True)
    if changes:
        await db.execute(update(Board).where(Board.id == board_id).values(**changes))
        await _log(board_id, current_user.id, "board.updated", str(changes), db)
        await db.commit()
        await db.refresh(board)

    return {"data": await _board_out(board, m.role.value, db)}


@router.post("/{board_id}/archive")
async def archive_board(
    board_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    board, m = await _require_board_member(board_id, current_user, db)
    if m.role != UserRole.owner:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Only the board owner can archive")
    await db.execute(update(Board).where(Board.id == board_id).values(is_archived=True))
    await db.commit()
    return {"data": {"message": "Board archived."}}


# ── members ────────────────────────────────────────────────────────────────────

@router.get("/{board_id}/members")
async def get_members(
    board_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _require_board_member(board_id, current_user, db)
    result = await db.execute(
        select(BoardMembership).where(BoardMembership.board_id == board_id)
        .order_by(BoardMembership.joined_at)
    )
    memberships = result.scalars().all()
    data = []
    for ms in memberships:
        u = await db.scalar(select(User).where(User.id == ms.user_id))
        if u:
            data.append(MemberOut(
                user_id=u.id, full_name=u.full_name, email=u.email,
                role=ms.role.value, avatar_url=u.avatar_url,
                initials_color=u.initials_color, joined_at=ms.joined_at,
            ).model_dump())
    return {"data": data}


@router.patch("/{board_id}/members/{user_id}")
async def update_member_role(
    board_id: int,
    user_id: int,
    body: MemberRoleUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _, m = await _require_board_member(board_id, current_user, db)
    if m.role != UserRole.owner:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Only the board owner can change roles")
    if user_id == current_user.id:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Cannot change your own role")

    target = await _board_membership(board_id, user_id, db)
    if not target:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Member not found")

    await db.execute(
        update(BoardMembership)
        .where(BoardMembership.board_id == board_id, BoardMembership.user_id == user_id)
        .values(role=body.role)
    )
    await _log(board_id, current_user.id, "member.role_changed", f"User {user_id} → {body.role}", db)
    await db.commit()
    return {"data": {"message": "Role updated."}}


@router.delete("/{board_id}/members/{user_id}")
async def remove_member(
    board_id: int,
    user_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _, m = await _require_board_member(board_id, current_user, db)
    # Owner can remove anyone; members can remove only themselves
    if user_id != current_user.id and m.role != UserRole.owner:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Not authorised to remove this member")

    target = await _board_membership(board_id, user_id, db)
    if not target:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Member not found")

    await db.execute(
        delete(BoardMembership)
        .where(BoardMembership.board_id == board_id, BoardMembership.user_id == user_id)
    )
    await _log(board_id, current_user.id, "member.removed", f"User {user_id} removed", db)
    await db.commit()
    return {"data": {"message": "Member removed."}}


# ── invite ─────────────────────────────────────────────────────────────────────

@router.get("/{board_id}/invites")
async def list_board_invites(
    board_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _, m = await _require_board_member(board_id, current_user, db)
    if m.role not in (UserRole.owner, UserRole.team):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Not authorised")

    result = await db.execute(
        select(Invite)
        .where(Invite.board_id == board_id, Invite.is_cancelled == False, Invite.accepted_at == None)
        .order_by(Invite.created_at.desc())
    )
    invites = result.scalars().all()
    return {
        "data": [
            BoardInviteOut(
                id=inv.id, email=inv.email, role=inv.role.value,
                expires_at=inv.expires_at, created_at=inv.created_at,
            ).model_dump()
            for inv in invites
        ]
    }


@router.post("/{board_id}/invite")
async def invite_user(
    board_id: int,
    body: BoardInviteRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    board, m = await _require_board_member(board_id, current_user, db)
    if m.role not in (UserRole.owner, UserRole.team):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Only owners and team members can invite")

    count = await _member_count(board_id, db)
    if count >= board.member_limit:
        raise HTTPException(status.HTTP_409_CONFLICT, "Board member limit reached")

    # Check already a member
    existing_user = await db.scalar(select(User).where(User.email == body.email, User.is_deleted == False))
    if existing_user:
        already = await _board_membership(board_id, existing_user.id, db)
        if already:
            raise HTTPException(status.HTTP_409_CONFLICT, "This user is already a member")

    token = secrets.token_urlsafe(32)
    expires = datetime.now(timezone.utc) + timedelta(days=7)
    db.add(Invite(
        email=str(body.email), board_id=board_id,
        invited_by_id=current_user.id, role=body.role or UserRole.team,
        token=token, expires_at=expires,
    ))
    await _log(board_id, current_user.id, "member.invited", f"Invited {body.email}", db)
    await db.commit()

    invite_url = f"{settings.FRONTEND_URL}/invite/accept?token={token}"
    await send_invite_board_email(str(body.email), str(body.email).split("@")[0], board.name, invite_url)
    return {"data": {"message": f"Invite sent to {body.email}"}}


# ── share link ──────────────────────────────────────────────────────────────────

@router.post("/{board_id}/share-link")
async def create_share_link(
    board_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _, m = await _require_board_member(board_id, current_user, db)
    if m.role not in (UserRole.owner, UserRole.team):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Not authorised")

    # Deactivate any existing link first
    await db.execute(
        update(ShareLink).where(ShareLink.board_id == board_id).values(is_active=False)
    )
    token = secrets.token_urlsafe(32)
    link = ShareLink(board_id=board_id, token=token, created_by_id=current_user.id)
    db.add(link)
    await db.commit()
    await db.refresh(link)

    url = f"{settings.FRONTEND_URL}/boards/join/{token}"
    return {"data": ShareLinkOut(
        id=link.id, token=token, role=link.role.value,
        url=url, is_active=True, created_at=link.created_at,
    ).model_dump()}


@router.delete("/{board_id}/share-link")
async def deactivate_share_link(
    board_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _, m = await _require_board_member(board_id, current_user, db)
    if m.role not in (UserRole.owner, UserRole.team):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Not authorised")

    await db.execute(
        update(ShareLink).where(ShareLink.board_id == board_id, ShareLink.is_active == True)
        .values(is_active=False)
    )
    await db.commit()
    return {"data": {"message": "Share link deactivated."}}


@router.get("/{board_id}/share-link")
async def get_share_link(
    board_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _require_board_member(board_id, current_user, db)
    link = await db.scalar(
        select(ShareLink).where(ShareLink.board_id == board_id, ShareLink.is_active == True)
    )
    if not link:
        return {"data": None}
    url = f"{settings.FRONTEND_URL}/boards/join/{link.token}"
    return {"data": ShareLinkOut(
        id=link.id, token=link.token, role=link.role.value,
        url=url, is_active=True, created_at=link.created_at,
    ).model_dump()}


# ── join requests ───────────────────────────────────────────────────────────────

@router.get("/join/{token}")
async def get_join_page_info(token: str, db: AsyncSession = Depends(get_db)):
    link = await db.scalar(
        select(ShareLink).where(ShareLink.token == token, ShareLink.is_active == True)
    )
    if not link:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Invalid or expired share link")
    board = await db.scalar(select(Board).where(Board.id == link.board_id, Board.is_archived == False))
    if not board:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Board not found")
    return {"data": {"board_id": board.id, "board_name": board.name, "role": link.role.value}}


@router.post("/{board_id}/join-requests")
async def create_join_request(
    board_id: int,
    body: JoinRequestCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    board = await db.scalar(select(Board).where(Board.id == board_id, Board.is_archived == False))
    if not board:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Board not found")

    already = await _board_membership(board_id, current_user.id, db)
    if already:
        raise HTTPException(status.HTTP_409_CONFLICT, "Already a member")

    existing_req = await db.scalar(
        select(JoinRequest).where(
            JoinRequest.board_id == board_id, JoinRequest.user_id == current_user.id,
            JoinRequest.status == "pending",
        )
    )
    if existing_req:
        raise HTTPException(status.HTTP_409_CONFLICT, "Join request already pending")

    db.add(JoinRequest(board_id=board_id, user_id=current_user.id, message=body.message))
    await db.commit()
    return {"data": {"message": "Join request submitted."}}


@router.get("/{board_id}/join-requests")
async def list_join_requests(
    board_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _, m = await _require_board_member(board_id, current_user, db)
    if m.role not in (UserRole.owner, UserRole.team):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Not authorised")

    result = await db.execute(
        select(JoinRequest)
        .where(JoinRequest.board_id == board_id, JoinRequest.status == "pending")
        .order_by(JoinRequest.created_at)
    )
    reqs = result.scalars().all()
    data = []
    for r in reqs:
        u = await db.scalar(select(User).where(User.id == r.user_id))
        if u:
            data.append(JoinRequestOut(
                id=r.id, user_id=u.id, full_name=u.full_name, email=u.email,
                message=r.message, status=r.status, created_at=r.created_at,
            ).model_dump())
    return {"data": data}


@router.patch("/{board_id}/join-requests/{req_id}")
async def review_join_request(
    board_id: int,
    req_id: int,
    body: JoinRequestReview,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    board, m = await _require_board_member(board_id, current_user, db)
    if m.role not in (UserRole.owner, UserRole.team):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Not authorised")

    req = await db.scalar(
        select(JoinRequest).where(JoinRequest.id == req_id, JoinRequest.board_id == board_id)
    )
    if not req:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Request not found")
    if req.status != "pending":
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Request already reviewed")

    await db.execute(
        update(JoinRequest).where(JoinRequest.id == req_id).values(
            status=body.status,
            reviewed_by_id=current_user.id,
            reviewed_at=datetime.now(timezone.utc),
        )
    )

    if body.status == "approved":
        count = await _member_count(board_id, db)
        if count < board.member_limit:
            db.add(BoardMembership(board_id=board_id, user_id=req.user_id, role=UserRole.client))
        await _log(board_id, current_user.id, "join_request.approved", f"User {req.user_id} approved", db)

    await db.commit()
    return {"data": {"message": f"Request {body.status}."}}


# ── board activity feed ────────────────────────────────────────────────────────

@router.get("/{board_id}/activity")
async def board_activity_feed(
    board_id: int,
    page: int = Query(1, ge=1),
    per_page: int = Query(30, le=100),
    user_id: int = Query(None),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _require_board_member(board_id, current_user, db)

    from models.card import Card
    from sqlalchemy import and_

    offset = (page - 1) * per_page
    where_clause = [ActivityLog.board_id == board_id]
    if user_id:
        where_clause.append(ActivityLog.user_id == user_id)

    result = await db.execute(
        select(ActivityLog, User, Card)
        .outerjoin(User, User.id == ActivityLog.user_id)
        .outerjoin(Card, and_(Card.id == ActivityLog.card_id, Card.is_deleted == False))
        .where(and_(*where_clause))
        .order_by(ActivityLog.created_at.desc())
        .limit(per_page)
        .offset(offset)
    )
    rows = result.all()
    total = await db.scalar(
        select(func.count()).select_from(ActivityLog).where(and_(*where_clause))
    ) or 0

    entries = []
    for log, user, card in rows:
        entries.append({
            "id": log.id,
            "action": log.action,
            "detail_json": log.detail_json,
            "created_at": log.created_at,
            "user": {"id": user.id, "full_name": user.full_name, "initials_color": user.initials_color} if user else None,
            "card": {"id": card.id, "title": card.title} if card else None,
        })

    return {"data": entries, "meta": {"page": page, "per_page": per_page, "total": total}}


# ── invite accept (standalone) ──────────────────────────────────────────────────

@invite_router.post("/accept")
async def accept_invite(body: InviteAcceptRequest, db: AsyncSession = Depends(get_db)):
    invite = await db.scalar(
        select(Invite).where(Invite.token == body.token, Invite.is_cancelled == False)
    )
    if not invite or invite.accepted_at:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Invalid or already-used invite link")

    expires = invite.expires_at
    if expires.tzinfo is None:
        expires = expires.replace(tzinfo=timezone.utc)
    if expires < datetime.now(timezone.utc):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Invite has expired")

    user = await db.scalar(select(User).where(User.email == invite.email, User.is_deleted == False))

    if not user:
        if not body.full_name or not body.password:
            raise HTTPException(
                status.HTTP_400_BAD_REQUEST,
                "New users must provide full_name and password"
            )
        user = User(
            email=invite.email,
            full_name=body.full_name,
            password_hash=hash_password(body.password),
            role=invite.role,
        )
        db.add(user)
        await db.flush()

    if invite.board_id:
        already = await _board_membership(invite.board_id, user.id, db)
        if not already:
            db.add(BoardMembership(board_id=invite.board_id, user_id=user.id, role=invite.role))
            await _log(invite.board_id, user.id, "member.joined", f"{user.email} joined via invite", db)

    await db.execute(
        update(Invite).where(Invite.id == invite.id)
        .values(accepted_at=datetime.now(timezone.utc))
    )
    await db.commit()
    await db.refresh(user)

    return {
        "data": {
            "access_token": create_access_token({"sub": str(user.id)}),
            "refresh_token": create_refresh_token({"sub": str(user.id)}),
            "token_type": "bearer",
            "user": UserOut.model_validate(user).model_dump(),
            "board_id": invite.board_id,
        }
    }
