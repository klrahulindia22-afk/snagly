from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, status, BackgroundTasks
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update
from typing import Optional
from database import get_db
from models.user import User, UserRole
from models.digest_preference import DigestPreference, DigestFrequency
from middleware.auth import get_current_user, require_super_admin

router = APIRouter(prefix="/api/v1", tags=["digest"])


class DigestPrefUpdate(BaseModel):
    frequency: DigestFrequency
    send_hour: int = Field(..., ge=0, le=23)


class DigestPrefOut(BaseModel):
    frequency: str
    send_hour: int
    last_sent_at: Optional[datetime]

    class Config:
        from_attributes = True


class DigestTriggerRequest(BaseModel):
    user_id: Optional[int] = None
    force: bool = False


@router.get("/users/me/digest-prefs")
async def get_digest_prefs(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    pref = await db.scalar(select(DigestPreference).where(DigestPreference.user_id == current_user.id))
    if not pref:
        return {"data": {"frequency": "off", "send_hour": 8, "last_sent_at": None}}
    return {"data": DigestPrefOut.model_validate(pref).model_dump()}


@router.patch("/users/me/digest-prefs")
async def update_digest_prefs(
    body: DigestPrefUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    pref = await db.scalar(select(DigestPreference).where(DigestPreference.user_id == current_user.id))
    if pref:
        await db.execute(
            update(DigestPreference)
            .where(DigestPreference.user_id == current_user.id)
            .values(frequency=body.frequency, send_hour=body.send_hour, updated_at=datetime.now(timezone.utc))
        )
    else:
        db.add(DigestPreference(
            user_id=current_user.id,
            frequency=body.frequency,
            send_hour=body.send_hour,
        ))
    await db.commit()
    pref = await db.scalar(select(DigestPreference).where(DigestPreference.user_id == current_user.id))
    return {"data": DigestPrefOut.model_validate(pref).model_dump()}


@router.post("/digest/trigger")
async def trigger_digest(
    body: DigestTriggerRequest,
    background_tasks: BackgroundTasks,
    _: User = Depends(require_super_admin),
    db: AsyncSession = Depends(get_db),
):
    from services.digest_service import send_digest_for_user

    if body.user_id:
        user_ids = [body.user_id]
    else:
        result = await db.execute(
            select(DigestPreference.user_id).where(DigestPreference.frequency != DigestFrequency.off)
        )
        user_ids = [row[0] for row in result.all()]

    if not user_ids:
        return {"data": {"message": "No users to digest.", "queued": 0}}

    for uid in user_ids:
        background_tasks.add_task(send_digest_for_user, uid, body.force)

    return {"data": {"message": f"Digest queued for {len(user_ids)} user(s).", "queued": len(user_ids)}}
