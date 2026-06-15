import asyncio
import re
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update
from database import get_db
from models.user import User
from models.card import Card
from models.comment import Comment
from models.comment_reply import CommentReply
from models.board_membership import BoardMembership
from models.board import Board
from middleware.auth import get_current_user
from services.notif_service import create_notification

card_comments_router = APIRouter(prefix="/api/v1/cards/{card_id}/comments", tags=["comments"])
comments_router = APIRouter(prefix="/api/v1/comments", tags=["comments"])
replies_router = APIRouter(prefix="/api/v1/comment-replies", tags=["comments"])

_MENTION_RE = re.compile(r"@(\w+)", re.UNICODE)


async def _broadcast_comment(board_id: int, card_id: int, comment_out: dict) -> None:
    try:
        from services.ws_manager import manager
        await manager.broadcast_to_board(board_id, {
            "type": "comment.created",
            "board_id": board_id,
            "data": {"card_id": card_id, "comment": comment_out},
        })
    except Exception:
        pass


class CommentCreate(BaseModel):
    body: str


class CommentUpdate(BaseModel):
    body: str


# ── helpers ───────────────────────────────────────────────────────────────────

async def _get_card_member(card_id: int, user: User, db: AsyncSession):
    card = await db.scalar(select(Card).where(Card.id == card_id, Card.is_deleted == False))
    if not card:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Card not found")
    m = await db.scalar(
        select(BoardMembership).where(
            BoardMembership.board_id == card.board_id,
            BoardMembership.user_id == user.id,
        )
    )
    if not m:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Not a board member")
    return card, m


async def _send_mention_email_task(
    to_email: str,
    mentioned_name: str,
    mentioner_name: str,
    board_name: str,
    card_title: str,
    card_url: str,
    comment_preview: str,
) -> None:
    try:
        from services.email_service import send_mention_email
        await send_mention_email(
            to_email=to_email,
            mentioned_name=mentioned_name,
            mentioner_name=mentioner_name,
            board_name=board_name,
            card_title=card_title,
            card_url=card_url,
            comment_preview=comment_preview,
        )
    except Exception:
        pass


async def _detect_and_notify_mentions(
    body: str,
    board_id: int,
    card_id: int,
    comment_id: int,
    author_id: int,
    db: AsyncSession,
    card_title: str = "",
    board_name: str = "",
    author_name: str = "",
):
    """Parse @word patterns and notify matching board members. @board notifies everyone."""
    words = {w.lower() for w in _MENTION_RE.findall(body)}
    if not words:
        return set()

    is_board_mention = "board" in words

    from config import settings
    card_url = f"{settings.FRONTEND_URL}/board/{board_id}?card={card_id}"

    result = await db.execute(
        select(BoardMembership, User)
        .join(User, BoardMembership.user_id == User.id)
        .where(BoardMembership.board_id == board_id, User.id != author_id)
    )
    notified_ids: set = set()
    for membership, member in result.all():
        if member.id in notified_ids:
            continue
        name_tokens = {t.lower() for t in member.full_name.split()}
        should_notify = is_board_mention or bool(words & name_tokens)
        if should_notify:
            notified_ids.add(member.id)
            await create_notification(
                db,
                user_id=member.id,
                type="mention",
                created_by_id=author_id,
                payload={"board_id": board_id, "card_id": card_id, "comment_id": comment_id},
            )
            asyncio.create_task(
                _send_mention_email_task(
                    to_email=str(member.email),
                    mentioned_name=member.full_name,
                    mentioner_name=author_name or "Someone",
                    board_name=board_name,
                    card_title=card_title,
                    card_url=card_url,
                    comment_preview=body,
                )
            )
    return notified_ids


async def _comment_out(comment: Comment, db: AsyncSession) -> dict:
    author = await db.scalar(select(User).where(User.id == comment.user_id))
    replies_res = await db.execute(
        select(CommentReply)
        .where(CommentReply.comment_id == comment.id)
        .order_by(CommentReply.created_at)
    )
    replies = []
    for reply in replies_res.scalars().all():
        reply_author = await db.scalar(select(User).where(User.id == reply.user_id))
        replies.append({
            "id": reply.id,
            "comment_id": reply.comment_id,
            "user_id": reply.user_id,
            "body": reply.body if not reply.is_deleted else None,
            "is_deleted": reply.is_deleted,
            "created_at": reply.created_at,
            "updated_at": reply.updated_at,
            "user": {
                "full_name": reply_author.full_name if reply_author else "Unknown",
                "initials_color": reply_author.initials_color if reply_author else None,
            },
        })
    return {
        "id": comment.id,
        "card_id": comment.card_id,
        "user_id": comment.user_id,
        "body": comment.body if not comment.is_deleted else None,
        "is_deleted": comment.is_deleted,
        "created_at": comment.created_at,
        "updated_at": comment.updated_at,
        "user": {
            "full_name": author.full_name if author else "Unknown",
            "initials_color": author.initials_color if author else None,
        },
        "replies": replies,
    }


# ── card → comments ───────────────────────────────────────────────────────────

@card_comments_router.get("")
async def list_comments(
    card_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _get_card_member(card_id, current_user, db)
    result = await db.execute(
        select(Comment)
        .where(Comment.card_id == card_id)
        .order_by(Comment.created_at)
    )
    comments = result.scalars().all()
    data = [await _comment_out(c, db) for c in comments]
    return {"data": data}


@card_comments_router.post("", status_code=status.HTTP_201_CREATED)
async def create_comment(
    card_id: int,
    body: CommentCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    card, _ = await _get_card_member(card_id, current_user, db)
    board = await db.scalar(select(Board).where(Board.id == card.board_id))

    comment = Comment(card_id=card_id, user_id=current_user.id, body=body.body)
    db.add(comment)
    await db.flush()

    comment_id = comment.id
    mentioned_ids = await _detect_and_notify_mentions(
        body.body, card.board_id, card_id, comment_id, current_user.id, db,
        card_title=card.title or "",
        board_name=board.name if board else "",
        author_name=current_user.full_name or "",
    ) or set()

    # Notify card assignees who weren't already notified via @mention
    from models.card_assignee import CardAssignee as _CA
    ca_rows = await db.execute(select(_CA).where(_CA.card_id == card_id))
    for ca in ca_rows.scalars().all():
        if ca.user_id != current_user.id and ca.user_id not in mentioned_ids:
            await create_notification(
                db,
                user_id=ca.user_id,
                type="comment",
                created_by_id=current_user.id,
                payload={"board_id": card.board_id, "card_id": card_id, "comment_id": comment_id},
            )

    await db.commit()

    comment = await db.scalar(select(Comment).where(Comment.id == comment_id))
    out = await _comment_out(comment, db)
    asyncio.create_task(_broadcast_comment(card.board_id, card_id, out))
    return {"data": out}


# ── comment CRUD ──────────────────────────────────────────────────────────────

@comments_router.patch("/{comment_id}")
async def update_comment(
    comment_id: int,
    body: CommentUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    comment = await db.scalar(
        select(Comment).where(Comment.id == comment_id, Comment.is_deleted == False)
    )
    if not comment:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Comment not found")
    if comment.user_id != current_user.id:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Cannot edit another user's comment")

    card = await db.scalar(select(Card).where(Card.id == comment.card_id))
    board = await db.scalar(select(Board).where(Board.id == card.board_id)) if card else None
    await db.execute(update(Comment).where(Comment.id == comment_id).values(body=body.body))
    await _detect_and_notify_mentions(
        body.body, card.board_id, comment.card_id, comment_id, current_user.id, db,
        card_title=card.title or "" if card else "",
        board_name=board.name if board else "",
        author_name=current_user.full_name or "",
    )
    await db.commit()

    comment = await db.scalar(select(Comment).where(Comment.id == comment_id))
    return {"data": await _comment_out(comment, db)}


@comments_router.delete("/{comment_id}")
async def delete_comment(
    comment_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    comment = await db.scalar(
        select(Comment).where(Comment.id == comment_id, Comment.is_deleted == False)
    )
    if not comment:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Comment not found")
    if comment.user_id != current_user.id:
        # Board owners can also delete any comment
        card = await db.scalar(select(Card).where(Card.id == comment.card_id))
        m = await db.scalar(
            select(BoardMembership).where(
                BoardMembership.board_id == card.board_id,
                BoardMembership.user_id == current_user.id,
                BoardMembership.role.in_(["owner"]),
            )
        )
        if not m and current_user.role.value not in ("super_admin",):
            raise HTTPException(status.HTTP_403_FORBIDDEN)

    await db.execute(
        update(Comment).where(Comment.id == comment_id).values(
            is_deleted=True, deleted_at=datetime.now(timezone.utc)
        )
    )
    await db.commit()
    return {"data": {"message": "Comment deleted."}}


# ── replies ───────────────────────────────────────────────────────────────────

@comments_router.post("/{comment_id}/replies", status_code=status.HTTP_201_CREATED)
async def create_reply(
    comment_id: int,
    body: CommentCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    comment = await db.scalar(
        select(Comment).where(Comment.id == comment_id, Comment.is_deleted == False)
    )
    if not comment:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Comment not found")
    card, _ = await _get_card_member(comment.card_id, current_user, db)

    reply = CommentReply(comment_id=comment_id, user_id=current_user.id, body=body.body)
    db.add(reply)
    await db.flush()

    # Notify comment author (if not self)
    if comment.user_id != current_user.id:
        await create_notification(
            db,
            user_id=comment.user_id,
            type="reply",
            created_by_id=current_user.id,
            payload={"board_id": card.board_id, "card_id": card.id, "comment_id": comment_id, "reply_id": reply.id},
        )

    await _detect_and_notify_mentions(
        body.body, card.board_id, card.id, comment_id, current_user.id, db
    )
    await db.commit()

    reply_id = reply.id
    reply = await db.scalar(select(CommentReply).where(CommentReply.id == reply_id))
    author = await db.scalar(select(User).where(User.id == reply.user_id))
    return {"data": {
        "id": reply.id, "comment_id": reply.comment_id, "user_id": reply.user_id,
        "body": reply.body, "is_deleted": reply.is_deleted,
        "created_at": reply.created_at, "updated_at": reply.updated_at,
        "user": {"full_name": author.full_name, "initials_color": author.initials_color},
    }}


@replies_router.patch("/{reply_id}")
async def update_reply(
    reply_id: int,
    body: CommentUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    reply = await db.scalar(
        select(CommentReply).where(CommentReply.id == reply_id, CommentReply.is_deleted == False)
    )
    if not reply:
        raise HTTPException(status.HTTP_404_NOT_FOUND)
    if reply.user_id != current_user.id:
        raise HTTPException(status.HTTP_403_FORBIDDEN)
    await db.execute(update(CommentReply).where(CommentReply.id == reply_id).values(body=body.body))
    await db.commit()
    reply = await db.scalar(select(CommentReply).where(CommentReply.id == reply_id))
    author = await db.scalar(select(User).where(User.id == reply.user_id))
    return {"data": {
        "id": reply.id, "comment_id": reply.comment_id, "user_id": reply.user_id,
        "body": reply.body, "is_deleted": reply.is_deleted,
        "created_at": reply.created_at, "updated_at": reply.updated_at,
        "user": {"full_name": author.full_name, "initials_color": author.initials_color},
    }}


@replies_router.delete("/{reply_id}")
async def delete_reply(
    reply_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    reply = await db.scalar(
        select(CommentReply).where(CommentReply.id == reply_id, CommentReply.is_deleted == False)
    )
    if not reply:
        raise HTTPException(status.HTTP_404_NOT_FOUND)
    if reply.user_id != current_user.id:
        raise HTTPException(status.HTTP_403_FORBIDDEN)
    await db.execute(
        update(CommentReply).where(CommentReply.id == reply_id).values(
            is_deleted=True, deleted_at=datetime.now(timezone.utc)
        )
    )
    await db.commit()
    return {"data": {"message": "Reply deleted."}}
