import re
import secrets
import logging
from typing import Optional
from datetime import datetime, timedelta, timezone

logger = logging.getLogger(__name__)
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
from middleware.auth import get_current_user, get_optional_current_user
from services.auth_service import hash_password, verify_password, create_access_token, create_refresh_token, generate_refresh_jti, random_avatar_color
from services.email_service import send_invite_board_email
from services.notif_service import create_notification
from models.plan import Plan, PlanFeatureFlag
from models.subscription import Subscription

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


def _slugify(name: str) -> str:
    s = name.lower().strip()
    s = re.sub(r"[^a-z0-9]+", "-", s)
    return s.strip("-") or "board"


async def _unique_slug(name: str, exclude_id: int | None, db: AsyncSession) -> str:
    base = _slugify(name)
    candidate = base
    n = 1
    while True:
        existing = await db.scalar(
            select(Board).where(Board.slug == candidate, Board.id != exclude_id)
            if exclude_id else select(Board).where(Board.slug == candidate)
        )
        if not existing:
            return candidate
        candidate = f"{base}-{n}"
        n += 1


async def _get_plan_flag(user_id: int, feature_key: str, db: AsyncSession):
    """Return (limit_value, plan_display_name) for a user's plan feature flag.
    Returns (None, plan_name) when unlimited, (int, plan_name) when capped.
    Falls back to the free plan when the user has no subscription.
    """
    sub = await db.scalar(select(Subscription).where(Subscription.user_id == user_id))
    if sub:
        plan = await db.get(Plan, sub.plan_id)
    else:
        plan = await db.scalar(select(Plan).where(Plan.name == "free"))
    if not plan:
        return None, "Free"
    flag = await db.scalar(
        select(PlanFeatureFlag).where(
            PlanFeatureFlag.plan_id == plan.id,
            PlanFeatureFlag.feature_key == feature_key,
        )
    )
    if not flag or not flag.is_enabled or flag.limit_value is None:
        return None, plan.display_name
    return int(flag.limit_value), plan.display_name


async def _board_out(board: Board, my_role: str, db: AsyncSession) -> dict:
    owner = await db.scalar(select(User).where(User.id == board.owner_id))
    count = await _member_count(board.id, db)
    return BoardOut(
        id=board.id, name=board.name, slug=board.slug, description=board.description,
        owner_id=board.owner_id, owner_name=owner.full_name if owner else None,
        member_limit=board.member_limit, bg_color=board.bg_color,
        is_archived=board.is_archived, archived_at=board.archived_at,
        created_at=board.created_at, my_role=my_role, member_count=count,
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
    import logging, traceback
    logger = logging.getLogger("boards.create")

    # ── Plan limit: max_boards ─────────────────────────────────────────────────
    max_boards, plan_name = await _get_plan_flag(current_user.id, "max_boards", db)
    if max_boards is not None:
        boards_used = await db.scalar(
            select(func.count()).select_from(Board)
            .where(Board.owner_id == current_user.id, Board.is_archived == False)
        ) or 0
        if boards_used >= max_boards:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Board limit reached. Your {plan_name} plan allows up to {max_boards} board(s). Upgrade to create more.",
            )

    try:
        slug = await _unique_slug(body.name, None, db)
        board = Board(
            name=body.name,
            slug=slug,
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
    except HTTPException:
        raise
    except Exception as e:
        logger.error("create_board failed: %s\n%s", e, traceback.format_exc())
        await db.rollback()
        raise HTTPException(status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Board creation failed: {e}")


@router.get("/by-slug/{slug}")
async def get_board_by_slug(
    slug: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    board = await db.scalar(select(Board).where(Board.slug == slug, Board.is_archived == False))
    if not board:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Board not found")
    m = await _board_membership(board.id, current_user.id, db)
    if not m:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Not a member of this board")
    return {"data": await _board_out(board, m.role.value, db)}


@router.get("/archived")
async def get_archived_boards(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Board, BoardMembership.role)
        .join(BoardMembership, Board.id == BoardMembership.board_id)
        .where(
            BoardMembership.user_id == current_user.id,
            BoardMembership.role == UserRole.owner,
            Board.is_archived == True,
        )
        .order_by(Board.archived_at.desc())
    )
    rows = result.all()
    data = [await _board_out(board, role.value, db) for board, role in rows]
    return {"data": data}


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
        if "name" in changes:
            changes["slug"] = await _unique_slug(changes["name"], board_id, db)
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
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    await db.execute(update(Board).where(Board.id == board_id).values(is_archived=True, archived_at=now))
    await _log(board_id, current_user.id, "board.archived", f"Board '{board.name}' archived", db)
    # Notify all members except the owner performing the action
    member_rows = (await db.execute(
        select(BoardMembership).where(
            BoardMembership.board_id == board_id,
            BoardMembership.user_id != current_user.id,
        )
    )).scalars().all()
    logger.info("archive_board %d: notifying %d member(s)", board_id, len(member_rows))
    for member in member_rows:
        try:
            await create_notification(
                db,
                user_id=member.user_id,
                type="board_archived",
                created_by_id=current_user.id,
                payload={"board_id": board_id, "board_name": board.name},
            )
        except Exception as e:
            logger.error("Failed to create board_archived notification for user %d: %s", member.user_id, e)
    await db.commit()
    return {"data": {"message": "Board archived."}}


@router.post("/{board_id}/restore")
async def restore_board(
    board_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    board = await db.scalar(select(Board).where(Board.id == board_id))
    if not board:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Board not found")
    m = await _board_membership(board_id, current_user.id, db)
    if not m or m.role != UserRole.owner:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Only the board owner can restore")
    await db.execute(update(Board).where(Board.id == board_id).values(is_archived=False, archived_at=None))
    await _log(board_id, current_user.id, "board.restored", f"Board '{board.name}' restored", db)
    # Notify all members except the owner performing the action
    member_rows = (await db.execute(
        select(BoardMembership).where(
            BoardMembership.board_id == board_id,
            BoardMembership.user_id != current_user.id,
        )
    )).scalars().all()
    logger.info("restore_board %d: notifying %d member(s)", board_id, len(member_rows))
    for member in member_rows:
        try:
            await create_notification(
                db,
                user_id=member.user_id,
                type="board_restored",
                created_by_id=current_user.id,
                payload={"board_id": board_id, "board_name": board.name},
            )
        except Exception as e:
            logger.error("Failed to create board_restored notification for user %d: %s", member.user_id, e)
    await db.commit()
    await db.refresh(board)
    return {"data": await _board_out(board, m.role.value, db)}


@router.delete("/{board_id}")
async def delete_board(
    board_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    from models.card import Card
    from models.list_ import List as BoardList
    from models.comment import Comment
    from models.comment_reply import CommentReply
    from models.comment_attachment import CommentAttachment
    from models.checklist import Checklist
    from models.checklist_item import ChecklistItem
    from models.card_assignee import CardAssignee
    from models.card_label import CardLabel
    from models.card_meta import CardMeta
    from models.card_field import CardField
    from models.card_watcher import CardWatcher
    from models.time_entry import TimeEntry
    from models.attachment import Attachment
    from models.external_ref import ExternalRef
    from models.list_automation_rule import ListAutomationRule
    from models.label import Label
    from models.field_definition import FieldDefinition
    from models.integration import Integration
    from models.sla_rule import SLARule
    from models.activity_log import ActivityLog

    board = await db.scalar(select(Board).where(Board.id == board_id))
    if not board:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Board not found")
    m = await _board_membership(board_id, current_user.id, db)
    if not m or m.role != UserRole.owner:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Only the board owner can delete this board")
    if not board.is_archived:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Board must be archived before it can be deleted")

    list_ids_sq = select(BoardList.id).where(BoardList.board_id == board_id).scalar_subquery()
    card_ids_sq = select(Card.id).where(Card.list_id.in_(list_ids_sq)).scalar_subquery()
    comment_ids_sq = select(Comment.id).where(Comment.card_id.in_(card_ids_sq)).scalar_subquery()
    checklist_ids_sq = select(Checklist.id).where(Checklist.card_id.in_(card_ids_sq)).scalar_subquery()

    await db.execute(delete(CommentReply).where(CommentReply.comment_id.in_(comment_ids_sq)))
    await db.execute(delete(CommentAttachment).where(CommentAttachment.comment_id.in_(comment_ids_sq)))
    await db.execute(delete(Comment).where(Comment.card_id.in_(card_ids_sq)))
    await db.execute(delete(ChecklistItem).where(ChecklistItem.checklist_id.in_(checklist_ids_sq)))
    await db.execute(delete(Checklist).where(Checklist.card_id.in_(card_ids_sq)))
    await db.execute(delete(CardAssignee).where(CardAssignee.card_id.in_(card_ids_sq)))
    await db.execute(delete(CardLabel).where(CardLabel.card_id.in_(card_ids_sq)))
    await db.execute(delete(CardMeta).where(CardMeta.card_id.in_(card_ids_sq)))
    await db.execute(delete(CardField).where(CardField.card_id.in_(card_ids_sq)))
    await db.execute(delete(CardWatcher).where(CardWatcher.card_id.in_(card_ids_sq)))
    await db.execute(delete(TimeEntry).where(TimeEntry.card_id.in_(card_ids_sq)))
    await db.execute(delete(Attachment).where(Attachment.card_id.in_(card_ids_sq)))
    await db.execute(delete(ExternalRef).where(ExternalRef.card_id.in_(card_ids_sq)))
    await db.execute(delete(Card).where(Card.list_id.in_(list_ids_sq)))
    await db.execute(delete(ListAutomationRule).where(ListAutomationRule.list_id.in_(list_ids_sq)))
    await db.execute(delete(BoardList).where(BoardList.board_id == board_id))
    await db.execute(delete(ActivityLog).where(ActivityLog.board_id == board_id))
    await db.execute(delete(BoardMembership).where(BoardMembership.board_id == board_id))
    await db.execute(delete(BoardActivityLog).where(BoardActivityLog.board_id == board_id))
    await db.execute(delete(Invite).where(Invite.board_id == board_id))
    await db.execute(delete(ShareLink).where(ShareLink.board_id == board_id))
    await db.execute(delete(JoinRequest).where(JoinRequest.board_id == board_id))
    await db.execute(delete(Label).where(Label.board_id == board_id))
    await db.execute(delete(FieldDefinition).where(FieldDefinition.board_id == board_id))
    await db.execute(delete(Integration).where(Integration.board_id == board_id))
    await db.execute(delete(SLARule).where(SLARule.board_id == board_id))
    await db.execute(delete(Board).where(Board.id == board_id))
    await db.commit()

    logger.info("delete_board %d: permanently deleted by user %d", board_id, current_user.id)
    return {"data": {"message": "Board permanently deleted."}}


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

    member_count = await _member_count(board_id, db)

    # Count non-expired, non-cancelled, unaccepted invites to reserve their slots
    pending_invite_count = await db.scalar(
        select(func.count()).select_from(Invite).where(
            Invite.board_id == board_id,
            Invite.is_cancelled == False,
            Invite.accepted_at == None,  # noqa: E711
            Invite.expires_at > datetime.now(timezone.utc),
        )
    ) or 0
    effective_count = member_count + pending_invite_count

    # ── Plan limit: max_members_per_board (based on board owner's plan) ────────
    max_members, plan_name = await _get_plan_flag(board.owner_id, "max_members_per_board", db)
    if max_members is not None and effective_count >= max_members:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Member limit reached. This board's {plan_name} plan allows up to {max_members} members ({member_count} joined, {pending_invite_count} pending). Upgrade to invite more.",
        )
    # Secondary guard: board-level hard cap set by admin
    if effective_count >= board.member_limit:
        raise HTTPException(status.HTTP_409_CONFLICT, "Board member limit reached")

    # Check already a member
    existing_user = await db.scalar(select(User).where(User.email == body.email, User.is_deleted == False))
    if existing_user:
        already = await _board_membership(board_id, existing_user.id, db)
        if already:
            raise HTTPException(status.HTTP_409_CONFLICT, "This user is already a board member")

    # Check for an existing pending invite to this email
    pending = await db.scalar(
        select(Invite).where(
            Invite.board_id == board_id,
            Invite.email == str(body.email),
            Invite.accepted_at == None,  # noqa: E711
            Invite.is_cancelled == False,
            Invite.expires_at > datetime.now(timezone.utc),
        )
    )
    if pending:
        raise HTTPException(status.HTTP_409_CONFLICT, "A pending invite has already been sent to this email")

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
    count = await _member_count(board.id, db)
    max_members, _ = await _get_plan_flag(board.owner_id, "max_members_per_board", db)
    is_full = max_members is not None and count >= max_members
    return {"data": {
        "board_id": board.id,
        "board_name": board.name,
        "role": link.role.value,
        "is_full": is_full,
        "member_count": count,
        "max_members": max_members,
    }}


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

    # Check board owner's plan member limit before accepting the join request
    count = await _member_count(board_id, db)
    max_members, plan_name = await _get_plan_flag(board.owner_id, "max_members_per_board", db)
    if max_members is not None and count >= max_members:
        raise HTTPException(
            status_code=403,
            detail=f"This board has reached its member limit ({max_members} members on the {plan_name} plan). The board owner would need to upgrade to accept more members.",
        )
    if count >= board.member_limit:
        raise HTTPException(status.HTTP_409_CONFLICT, "Board member limit reached")

    db.add(JoinRequest(board_id=board_id, user_id=current_user.id, message=body.message))

    # Notify all board owners so they can review the request
    owners = await db.execute(
        select(BoardMembership).where(
            BoardMembership.board_id == board_id,
            BoardMembership.role.in_([UserRole.owner, UserRole.team]),
        )
    )
    for om in owners.scalars().all():
        await create_notification(
            db,
            user_id=om.user_id,
            type="join_request_received",
            created_by_id=current_user.id,
            payload={"board_id": board_id, "user_id": current_user.id},
        )

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
        max_members, plan_name = await _get_plan_flag(board.owner_id, "max_members_per_board", db)
        if max_members is not None and count >= max_members:
            raise HTTPException(
                status_code=403,
                detail=f"Cannot approve: board has reached its member limit ({max_members} on the {plan_name} plan). Upgrade your plan to add more members.",
            )
        if count >= board.member_limit:
            raise HTTPException(status.HTTP_409_CONFLICT, "Board member limit reached")
        db.add(BoardMembership(board_id=board_id, user_id=req.user_id, role=UserRole.client))
        await _log(board_id, current_user.id, "join_request.approved", f"User {req.user_id} approved", db)
        await create_notification(
            db,
            user_id=req.user_id,
            type="join_request_approved",
            created_by_id=current_user.id,
            payload={"board_id": board_id},
        )
    elif body.status == "declined":
        await create_notification(
            db,
            user_id=req.user_id,
            type="join_request_declined",
            created_by_id=current_user.id,
            payload={"board_id": board_id},
        )

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

@invite_router.get("/info")
async def get_invite_info(token: str, db: AsyncSession = Depends(get_db)):
    """Return basic invite metadata so the frontend can validate the logged-in user."""
    invite = await db.scalar(
        select(Invite).where(Invite.token == token, Invite.is_cancelled == False)
    )
    if not invite or invite.accepted_at:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Invalid or already-used invite link")

    expires = invite.expires_at
    if expires.tzinfo is None:
        expires = expires.replace(tzinfo=timezone.utc)
    if expires < datetime.now(timezone.utc):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Invite has expired")

    user = await db.scalar(
        select(User).where(User.email == invite.email, User.is_deleted == False)
    )
    board = await db.scalar(select(Board).where(Board.id == invite.board_id))

    return {
        "data": {
            "email": invite.email,
            "board_name": board.name if board else None,
            "is_new_user": user is None,
        }
    }


@invite_router.post("/accept")
async def accept_invite(
    body: InviteAcceptRequest,
    db: AsyncSession = Depends(get_db),
    auth_user: Optional[User] = Depends(get_optional_current_user),
):
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
        # New user: require name + password to create account
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
            is_verified=True,
            is_active=True,
            initials_color=random_avatar_color(),
        )
        db.add(user)
        await db.flush()
    else:
        # Existing user: verify identity
        # Allow if already authenticated as this exact user via Bearer token
        already_authenticated = auth_user is not None and auth_user.id == user.id
        if not already_authenticated:
            if not body.password:
                raise HTTPException(
                    status.HTTP_400_BAD_REQUEST,
                    "Password required to accept invite"
                )
            if not verify_password(body.password, user.password_hash):
                raise HTTPException(
                    status.HTTP_401_UNAUTHORIZED,
                    "Invalid password"
                )

    if invite.board_id:
        already = await _board_membership(invite.board_id, user.id, db)
        if not already:
            board = await db.scalar(select(Board).where(Board.id == invite.board_id))
            if board:
                count = await _member_count(invite.board_id, db)
                # Check board owner's plan limit — enforced even when invite was already sent
                max_members, plan_name = await _get_plan_flag(board.owner_id, "max_members_per_board", db)
                if max_members is not None and count >= max_members:
                    raise HTTPException(
                        status_code=status.HTTP_403_FORBIDDEN,
                        detail=(
                            f"This board has reached its member limit "
                            f"({max_members} members on the {plan_name} plan). "
                            f"Ask the board owner to upgrade their plan."
                        ),
                    )
                if count >= board.member_limit:
                    raise HTTPException(
                        status_code=status.HTTP_409_CONFLICT,
                        detail="Board member limit reached.",
                    )
            db.add(BoardMembership(board_id=invite.board_id, user_id=user.id, role=invite.role))
            await _log(invite.board_id, user.id, "member.joined", f"{user.email} joined via invite", db)

    await db.execute(
        update(Invite).where(Invite.id == invite.id)
        .values(accepted_at=datetime.now(timezone.utc))
    )
    jti = generate_refresh_jti()
    await db.execute(update(User).where(User.id == user.id).values(current_refresh_jti=jti))
    await db.commit()
    await db.refresh(user)

    return {
        "data": {
            "access_token": create_access_token({"sub": str(user.id)}),
            "refresh_token": create_refresh_token({"sub": str(user.id), "jti": jti}),
            "token_type": "bearer",
            "user": UserOut.model_validate(user).model_dump(),
            "board_id": invite.board_id,
        }
    }
