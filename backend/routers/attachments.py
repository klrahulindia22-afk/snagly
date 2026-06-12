import os
import uuid
import aiofiles
from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File
from pydantic import BaseModel
from typing import Optional
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update, delete
from database import get_db
from models.user import User
from models.card import Card
from models.attachment import Attachment
from models.board_membership import BoardMembership
from middleware.auth import get_current_user
from config import settings

ALLOWED_MIME = {
    "image/jpeg", "image/png", "image/gif", "image/webp", "image/svg+xml",
    "application/pdf", "text/plain", "text/csv",
    "application/vnd.ms-excel",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/zip", "video/mp4", "video/quicktime",
}
MAX_BYTES = settings.MAX_UPLOAD_MB * 1024 * 1024

card_attachments_router = APIRouter(prefix="/api/v1/cards/{card_id}/attachments", tags=["attachments"])
attachments_router = APIRouter(prefix="/api/v1/attachments", tags=["attachments"])


class LinkAttachmentCreate(BaseModel):
    link_url: str
    link_title: Optional[str] = None


async def _card_member(card_id: int, user: User, db: AsyncSession):
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
        raise HTTPException(status.HTTP_403_FORBIDDEN)
    return card, m


def _att_out(att):
    return {
        "id": att.id, "card_id": att.card_id,
        "file_name": att.file_name, "file_url": att.file_url,
        "mime_type": att.mime_type, "file_size": att.file_size,
        "is_cover": att.is_cover,
        "link_url": att.link_url, "link_title": att.link_title,
        "created_at": att.created_at, "uploaded_by_id": att.uploaded_by_id,
    }


@card_attachments_router.get("")
async def list_attachments(
    card_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _card_member(card_id, current_user, db)
    result = await db.execute(
        select(Attachment).where(Attachment.card_id == card_id).order_by(Attachment.created_at.desc())
    )
    return {"data": [_att_out(a) for a in result.scalars().all()]}


@card_attachments_router.post("", status_code=status.HTTP_201_CREATED)
async def upload_attachment(
    card_id: int,
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    card, _ = await _card_member(card_id, current_user, db)

    content = await file.read()
    if len(content) > MAX_BYTES:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, f"File exceeds {settings.MAX_UPLOAD_MB}MB limit")
    if file.content_type not in ALLOWED_MIME:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, f"File type not allowed: {file.content_type}")

    upload_dir = os.path.join(settings.UPLOAD_DIR, str(card.board_id), str(card_id))
    os.makedirs(upload_dir, exist_ok=True)

    ext = os.path.splitext(file.filename or "")[1]
    stored_name = f"{uuid.uuid4().hex}{ext}"
    file_path = os.path.join(upload_dir, stored_name)

    async with aiofiles.open(file_path, "wb") as f:
        await f.write(content)

    file_url = f"/uploads/{card.board_id}/{card_id}/{stored_name}"

    att = Attachment(
        card_id=card_id,
        uploaded_by_id=current_user.id,
        file_name=file.filename,
        file_path=file_path,
        file_url=file_url,
        mime_type=file.content_type,
        file_size=len(content),
    )
    db.add(att)
    await db.commit()
    att = await db.scalar(select(Attachment).where(Attachment.id == att.id))
    return {"data": _att_out(att)}


@card_attachments_router.post("/link", status_code=status.HTTP_201_CREATED)
async def add_link_attachment(
    card_id: int,
    body: LinkAttachmentCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _card_member(card_id, current_user, db)
    att = Attachment(
        card_id=card_id,
        uploaded_by_id=current_user.id,
        link_url=body.link_url,
        link_title=body.link_title,
    )
    db.add(att)
    await db.commit()
    att = await db.scalar(select(Attachment).where(Attachment.id == att.id))
    return {"data": _att_out(att)}


@attachments_router.delete("/{attachment_id}")
async def delete_attachment(
    attachment_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    att = await db.scalar(select(Attachment).where(Attachment.id == attachment_id))
    if not att:
        raise HTTPException(status.HTTP_404_NOT_FOUND)
    card = await db.scalar(select(Card).where(Card.id == att.card_id))
    m = await db.scalar(
        select(BoardMembership).where(
            BoardMembership.board_id == card.board_id,
            BoardMembership.user_id == current_user.id,
        )
    )
    if not m:
        raise HTTPException(status.HTTP_403_FORBIDDEN)

    if att.file_path and os.path.exists(att.file_path):
        os.remove(att.file_path)

    await db.execute(delete(Attachment).where(Attachment.id == attachment_id))
    await db.commit()
    return {"data": {"message": "Attachment deleted."}}


@attachments_router.patch("/{attachment_id}/cover")
async def set_cover(
    attachment_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    att = await db.scalar(select(Attachment).where(Attachment.id == attachment_id))
    if not att:
        raise HTTPException(status.HTTP_404_NOT_FOUND)
    if not att.file_url:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Only file attachments can be set as cover")
    card = await db.scalar(select(Card).where(Card.id == att.card_id))
    m = await db.scalar(
        select(BoardMembership).where(
            BoardMembership.board_id == card.board_id,
            BoardMembership.user_id == current_user.id,
        )
    )
    if not m:
        raise HTTPException(status.HTTP_403_FORBIDDEN)

    await db.execute(update(Attachment).where(Attachment.card_id == att.card_id).values(is_cover=False))
    await db.execute(update(Attachment).where(Attachment.id == attachment_id).values(is_cover=True))
    await db.execute(update(Card).where(Card.id == att.card_id).values(cover_image_url=att.file_url))
    await db.commit()
    return {"data": {"message": "Cover set.", "cover_url": att.file_url}}
