from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update
from database import get_db
from models.user import User, UserRole
from models.board import Board
from models.card import Card
from models.board_membership import BoardMembership
from models.integration import Integration, IntegrationType
from models.external_ref import ExternalRef, PushStatus
from schemas.integration import IntegrationCreate, IntegrationUpdate
from middleware.auth import get_current_user
from services.encryption import encrypt_json, decrypt_json
from services.push_service import push_card
from services.activity_service import log_activity

board_integrations_router = APIRouter(
    prefix="/api/v1/boards/{board_id}/integrations", tags=["integrations"]
)
card_push_router = APIRouter(prefix="/api/v1/cards/{card_id}", tags=["integrations"])


# ── helpers ────────────────────────────────────────────────────────────────────

VALID_TYPES = {t.value for t in IntegrationType}

TOKEN_FIELDS = {"api_token", "token"}


def _safe_config(config: dict) -> dict:
    return {k: ("***" if k in TOKEN_FIELDS else v) for k, v in config.items()}


async def _require_owner(board_id: int, current_user: User, db: AsyncSession):
    board = await db.scalar(
        select(Board).where(Board.id == board_id, Board.is_archived == False)
    )
    if not board:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Board not found")
    m = await db.scalar(
        select(BoardMembership).where(
            BoardMembership.board_id == board_id,
            BoardMembership.user_id == current_user.id,
        )
    )
    if not m:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Not a member of this board")
    if m.role not in (UserRole.owner, UserRole.super_admin) and current_user.role != UserRole.super_admin:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Board owner access required")
    return board, m


async def _require_member(board_id: int, current_user: User, db: AsyncSession):
    board = await db.scalar(
        select(Board).where(Board.id == board_id, Board.is_archived == False)
    )
    if not board:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Board not found")
    m = await db.scalar(
        select(BoardMembership).where(
            BoardMembership.board_id == board_id,
            BoardMembership.user_id == current_user.id,
        )
    )
    if not m:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Not a member of this board")
    return board, m


def _integration_out(integration: Integration) -> dict:
    config = decrypt_json(integration.config_json)
    return {
        "id": integration.id,
        "board_id": integration.board_id,
        "type": integration.type.value,
        "name": integration.name,
        "config": _safe_config(config),
        "is_active": integration.is_active,
        "created_at": integration.created_at.isoformat() if integration.created_at else None,
    }


# ── board integration CRUD ────────────────────────────────────────────────────

@board_integrations_router.get("")
async def list_integrations(
    board_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _require_member(board_id, current_user, db)
    result = await db.execute(
        select(Integration).where(Integration.board_id == board_id).order_by(Integration.created_at)
    )
    integrations = result.scalars().all()
    return {"data": [_integration_out(i) for i in integrations]}


@board_integrations_router.post("", status_code=status.HTTP_201_CREATED)
async def create_integration(
    board_id: int,
    body: IntegrationCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _require_owner(board_id, current_user, db)

    if body.type not in VALID_TYPES:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, f"Invalid type. Must be one of: {', '.join(VALID_TYPES)}")

    encrypted = encrypt_json(body.config)
    integration = Integration(
        board_id=board_id,
        type=IntegrationType(body.type),
        name=body.name or body.type.capitalize(),
        config_json=encrypted,
        created_by_id=current_user.id,
    )
    db.add(integration)
    await db.commit()

    refreshed = await db.scalar(select(Integration).where(Integration.id == integration.id))
    return {"data": _integration_out(refreshed)}


@board_integrations_router.patch("/{integration_id}")
async def update_integration(
    board_id: int,
    integration_id: int,
    body: IntegrationUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _require_owner(board_id, current_user, db)

    integration = await db.scalar(
        select(Integration).where(
            Integration.id == integration_id, Integration.board_id == board_id
        )
    )
    if not integration:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Integration not found")

    updates = {}
    if body.name is not None:
        updates["name"] = body.name
    if body.is_active is not None:
        updates["is_active"] = body.is_active
    if body.config is not None:
        # Merge new config over existing decrypted config (so partial updates keep old non-token fields)
        existing_config = decrypt_json(integration.config_json)
        merged = {**existing_config, **body.config}
        updates["config_json"] = encrypt_json(merged)

    if updates:
        await db.execute(update(Integration).where(Integration.id == integration_id).values(**updates))
        await db.commit()

    refreshed = await db.scalar(select(Integration).where(Integration.id == integration_id))
    return {"data": _integration_out(refreshed)}


@board_integrations_router.delete("/{integration_id}")
async def delete_integration(
    board_id: int,
    integration_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _require_owner(board_id, current_user, db)
    integration = await db.scalar(
        select(Integration).where(
            Integration.id == integration_id, Integration.board_id == board_id
        )
    )
    if not integration:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Integration not found")

    await db.delete(integration)
    await db.commit()
    return {"data": {"message": "Integration deleted."}}


# ── card push ─────────────────────────────────────────────────────────────────

@card_push_router.get("/push-status")
async def get_push_status(
    card_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    card = await db.scalar(select(Card).where(Card.id == card_id, Card.is_deleted == False))
    if not card:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Card not found")
    await _require_member(card.board_id, current_user, db)

    result = await db.execute(
        select(ExternalRef, Integration)
        .join(Integration, ExternalRef.integration_id == Integration.id)
        .where(ExternalRef.card_id == card_id)
    )
    rows = result.all()

    data = []
    for ref, integration in rows:
        pusher = None
        if ref.pushed_by_id:
            from models.user import User as UserModel
            pusher = await db.scalar(select(UserModel).where(UserModel.id == ref.pushed_by_id))
        data.append({
            "id": ref.id,
            "card_id": ref.card_id,
            "integration_id": ref.integration_id,
            "integration_type": integration.type.value,
            "integration_name": integration.name,
            "external_id": ref.external_id,
            "external_url": ref.external_url,
            "status": ref.status.value,
            "error_message": ref.error_message,
            "pushed_at": ref.pushed_at.isoformat() if ref.pushed_at else None,
            "pushed_by_name": pusher.full_name if pusher else None,
        })

    return {"data": data}


@card_push_router.post("/push/{integration_id}")
async def push_card_to_integration(
    card_id: int,
    integration_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    card = await db.scalar(select(Card).where(Card.id == card_id, Card.is_deleted == False))
    if not card:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Card not found")

    _, m = await _require_member(card.board_id, current_user, db)
    if m.role == UserRole.client:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Clients cannot push to integrations")

    integration = await db.scalar(
        select(Integration).where(
            Integration.id == integration_id,
            Integration.board_id == card.board_id,
            Integration.is_active == True,
        )
    )
    if not integration:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Integration not found or inactive")

    # Perform the push
    external_id, external_url, error_msg = await push_card(card, integration)
    now = datetime.now(timezone.utc)
    success = error_msg is None

    # Upsert ExternalRef (one record per card+integration pair)
    existing = await db.scalar(
        select(ExternalRef).where(
            ExternalRef.card_id == card_id,
            ExternalRef.integration_id == integration_id,
        )
    )
    if existing:
        await db.execute(
            update(ExternalRef)
            .where(ExternalRef.id == existing.id)
            .values(
                external_id=external_id,
                external_url=external_url,
                status=PushStatus.success if success else PushStatus.failed,
                error_message=error_msg,
                pushed_at=now if success else existing.pushed_at,
                pushed_by_id=current_user.id,
            )
        )
    else:
        ref = ExternalRef(
            card_id=card_id,
            integration_id=integration_id,
            external_id=external_id,
            external_url=external_url,
            status=PushStatus.success if success else PushStatus.failed,
            error_message=error_msg,
            pushed_at=now if success else None,
            pushed_by_id=current_user.id,
        )
        db.add(ref)

    # Activity log
    action = f"pushed to {integration.type.value}"
    detail = {"integration_name": integration.name, "integration_type": integration.type.value}
    if success:
        detail["external_url"] = external_url
        detail["external_id"] = external_id
    else:
        detail["error"] = error_msg
    await log_activity(
        db,
        board_id=card.board_id,
        user_id=current_user.id,
        action=action,
        card_id=card_id,
        detail=detail,
    )

    await db.commit()

    if success:
        return {
            "data": {
                "status": "success",
                "external_id": external_id,
                "external_url": external_url,
                "integration_type": integration.type.value,
                "integration_name": integration.name,
            }
        }
    else:
        raise HTTPException(
            status.HTTP_502_BAD_GATEWAY,
            detail={"code": "PUSH_FAILED", "message": error_msg},
        )
