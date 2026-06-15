import json
from fastapi import APIRouter, Depends, HTTPException, status, Query
from pydantic import BaseModel
from typing import Optional
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update, func
from database import get_db
from models.user import User
from models.notification import Notification
from models.user_notification_prefs import UserNotificationPrefs
from middleware.auth import get_current_user

router = APIRouter(prefix="/api/v1/notifications", tags=["notifications"])
users_notif_router = APIRouter(prefix="/api/v1/users", tags=["notifications"])

# ── helpers ───────────────────────────────────────────────────────────────────

def _notif_text(type_: str, creator_name: str) -> str:
    texts = {
        "mention": f"{creator_name} mentioned you in a comment",
        "reply": f"{creator_name} replied to your comment",
        "comment": f"{creator_name} commented on a card you're assigned to",
        "card_assigned": f"{creator_name} assigned you to a card",
        "join_request_received": f"{creator_name} requested to join your board",
        "join_request_approved": "Your join request was approved",
        "join_request_declined": "Your join request was declined",
        "card_overdue": "A card assigned to you is overdue",
        "push_failed": "An integration push failed",
        "board_archived": f"{creator_name} archived the board — you no longer have access",
        "board_restored": f"{creator_name} restored the board — you can access it again",
    }
    return texts.get(type_, f"{creator_name} triggered a notification")


async def _build_notif(notif: Notification, db: AsyncSession) -> dict:
    creator = None
    if notif.created_by_id:
        creator = await db.scalar(select(User).where(User.id == notif.created_by_id))
    payload = json.loads(notif.payload_json) if notif.payload_json else {}
    creator_name = creator.full_name if creator else "Someone"
    return {
        "id": notif.id,
        "type": notif.type,
        "text": _notif_text(notif.type, creator_name),
        "is_read": notif.is_read,
        "created_at": notif.created_at,
        "payload": payload,
        "creator": {
            "full_name": creator_name,
            "initials_color": creator.initials_color if creator else None,
        } if creator else None,
    }


# ── routes — order matters: static paths before /{id} ────────────────────────

@router.get("/poll")
async def poll_notifications(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    unread_count = await db.scalar(
        select(func.count()).select_from(Notification).where(
            Notification.user_id == current_user.id,
            Notification.is_read == False,
        )
    ) or 0

    result = await db.execute(
        select(Notification)
        .where(Notification.user_id == current_user.id)
        .order_by(Notification.created_at.desc())
        .limit(5)
    )
    latest = [await _build_notif(n, db) for n in result.scalars().all()]
    return {"data": {"unread_count": unread_count, "notifications": latest}}


@router.get("")
async def list_notifications(
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    total = await db.scalar(
        select(func.count()).select_from(Notification).where(
            Notification.user_id == current_user.id
        )
    ) or 0
    offset = (page - 1) * per_page
    result = await db.execute(
        select(Notification)
        .where(Notification.user_id == current_user.id)
        .order_by(Notification.created_at.desc())
        .offset(offset).limit(per_page)
    )
    data = [await _build_notif(n, db) for n in result.scalars().all()]
    return {"data": data, "meta": {"page": page, "per_page": per_page, "total": total}}


@router.patch("/read-all")
async def mark_all_read(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await db.execute(
        update(Notification)
        .where(Notification.user_id == current_user.id, Notification.is_read == False)
        .values(is_read=True)
    )
    await db.commit()
    return {"data": {"message": "All notifications marked as read."}}


@router.patch("/{notif_id}/read")
async def mark_read(
    notif_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    notif = await db.scalar(
        select(Notification).where(
            Notification.id == notif_id,
            Notification.user_id == current_user.id,
        )
    )
    if not notif:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Notification not found")
    await db.execute(
        update(Notification).where(Notification.id == notif_id).values(is_read=True)
    )
    await db.commit()
    return {"data": {"message": "Marked as read."}}


# ── notification prefs (on /api/v1/users) ─────────────────────────────────────

class PrefsUpdate(BaseModel):
    in_app_mention: Optional[bool] = None
    in_app_comment: Optional[bool] = None
    in_app_reply: Optional[bool] = None
    in_app_card_assigned: Optional[bool] = None
    in_app_join_request: Optional[bool] = None
    in_app_board_archived: Optional[bool] = None
    in_app_board_restored: Optional[bool] = None
    email_mention: Optional[bool] = None
    email_comment: Optional[bool] = None
    email_reply: Optional[bool] = None
    email_card_assigned: Optional[bool] = None
    email_card_overdue: Optional[bool] = None
    email_join_request: Optional[bool] = None


def _prefs_out(prefs: UserNotificationPrefs) -> dict:
    return {
        "in_app_mention": prefs.in_app_mention,
        "in_app_comment": prefs.in_app_comment,
        "in_app_reply": prefs.in_app_reply,
        "in_app_card_assigned": prefs.in_app_card_assigned,
        "in_app_join_request": prefs.in_app_join_request,
        "in_app_board_archived": prefs.in_app_board_archived,
        "in_app_board_restored": prefs.in_app_board_restored,
        "email_mention": prefs.email_mention,
        "email_comment": prefs.email_comment,
        "email_reply": prefs.email_reply,
        "email_card_assigned": prefs.email_card_assigned,
        "email_card_overdue": prefs.email_card_overdue,
        "email_join_request": prefs.email_join_request,
    }


@users_notif_router.get("/me/notification-prefs")
async def get_prefs(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    prefs = await db.scalar(
        select(UserNotificationPrefs).where(UserNotificationPrefs.user_id == current_user.id)
    )
    if not prefs:
        prefs = UserNotificationPrefs(user_id=current_user.id)
        db.add(prefs)
        await db.commit()
        prefs = await db.scalar(
            select(UserNotificationPrefs).where(UserNotificationPrefs.user_id == current_user.id)
        )
    return {"data": _prefs_out(prefs)}


@users_notif_router.patch("/me/notification-prefs")
async def update_prefs(
    body: PrefsUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    prefs = await db.scalar(
        select(UserNotificationPrefs).where(UserNotificationPrefs.user_id == current_user.id)
    )
    if not prefs:
        prefs = UserNotificationPrefs(user_id=current_user.id)
        db.add(prefs)
        await db.flush()

    changes = body.model_dump(exclude_none=True)
    if changes:
        await db.execute(
            update(UserNotificationPrefs)
            .where(UserNotificationPrefs.user_id == current_user.id)
            .values(**changes)
        )
    await db.commit()

    prefs = await db.scalar(
        select(UserNotificationPrefs).where(UserNotificationPrefs.user_id == current_user.id)
    )
    return {"data": _prefs_out(prefs)}
