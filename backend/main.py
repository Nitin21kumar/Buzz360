from contextlib import asynccontextmanager

from dotenv import load_dotenv

load_dotenv()

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware

from app.core.config import settings
from app.core.exceptions import register_exception_handlers
from app.core.logging import configure_logging
from app.core.rate_limit import limiter
from app.db.client import check_connection
from app.db.collections import ensure_indexes
from app.modules.campaigns.router import router as campaigns_router
from app.modules.sms import service as sms_service
from app.modules.sms.router import router as sms_router
from app.modules.stt.router import router as stt_router
from app.modules.tts.router import router as tts_router
from app.modules.users.router import router as users_router

configure_logging()

settings.validate_for_production()


@asynccontextmanager
async def lifespan(app: FastAPI):
    ensure_indexes()
    sms_service.start_duplicate_retry_worker()
    yield


def create_app() -> FastAPI:
    app = FastAPI(title="OBD Suite API", version="2.1.0", lifespan=lifespan)

    app.state.limiter = limiter
    app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
    app.add_middleware(SlowAPIMiddleware)

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.allowed_origins,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    register_exception_handlers(app)

    app.include_router(tts_router)
    app.include_router(stt_router)
    app.include_router(campaigns_router)
    app.include_router(users_router)
    app.include_router(sms_router)

    @app.get("/")
    def root():
        return {"service": "OBD Suite API", "status": "running", "docs": "/docs"}

    @app.get("/health")
    def health():
        return {"status": "ok", "postgres_connected": check_connection()}

    return app


app = create_app()
