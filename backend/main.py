import os
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from config import settings
# Import new Phase 0 models so Alembic detects them
import models.plan          # noqa: F401
import models.system_config # noqa: F401
import models.login_attempt # noqa: F401
import models.admin_audit_log # noqa: F401
from routers.auth import router as auth_router, users_router
from routers.admin import router as admin_router
from routers.boards import router as boards_router, invite_router
from routers.lists import router as lists_router
from routers.cards import board_cards_router, cards_router
from routers.labels import router as labels_router
from routers.checklists import card_checklists_router, checklists_router, checklist_items_router
from routers.attachments import card_attachments_router, attachments_router
from routers.activity import card_activity_router
from routers.comments import card_comments_router, comments_router, replies_router
from routers.notifications import router as notif_router, users_notif_router
from routers.search import router as search_router
from routers.archive import router as archive_router
from routers.integrations import board_integrations_router, card_push_router
from routers.dashboard import board_dash_router, global_dash_router
from routers.ws import ws_router
from routers.sla import router as sla_router
from routers.digest import router as digest_router
from routers.watchers import router as watchers_router
from routers.templates import router as templates_router
from routers.fields import board_fields_router, card_fields_router
from routers.time_entries import router as time_entries_router, time_entry_router
from routers.export_import import router as export_import_router


@asynccontextmanager
async def lifespan(app: FastAPI):
    os.makedirs(settings.UPLOAD_DIR, exist_ok=True)
    yield


app = FastAPI(
    title="Snagly API",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.FRONTEND_URL],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_router)
app.include_router(users_router)
app.include_router(admin_router)
app.include_router(boards_router)
app.include_router(invite_router)
app.include_router(lists_router)
app.include_router(board_cards_router)
app.include_router(cards_router)
app.include_router(labels_router)
app.include_router(card_checklists_router)
app.include_router(checklists_router)
app.include_router(checklist_items_router)
app.include_router(card_attachments_router)
app.include_router(attachments_router)
app.include_router(card_activity_router)
app.include_router(card_comments_router)
app.include_router(comments_router)
app.include_router(replies_router)
app.include_router(notif_router)
app.include_router(users_notif_router)
app.include_router(search_router)
app.include_router(archive_router)
app.include_router(board_integrations_router)
app.include_router(card_push_router)
app.include_router(board_dash_router)
app.include_router(global_dash_router)
app.include_router(ws_router)
app.include_router(sla_router)
app.include_router(digest_router)
app.include_router(watchers_router)
app.include_router(templates_router)
app.include_router(board_fields_router)
app.include_router(card_fields_router)
app.include_router(time_entries_router)
app.include_router(time_entry_router)
app.include_router(export_import_router)

# Serve uploaded files
os.makedirs(settings.UPLOAD_DIR, exist_ok=True)
app.mount("/uploads", StaticFiles(directory=settings.UPLOAD_DIR), name="uploads")


@app.get("/api/v1/health")
async def health():
    return {"data": {"status": "ok"}}
