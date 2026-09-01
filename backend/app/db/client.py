from app.core.config import settings
from app.db.postgres_store import check_postgres_connection, ensure_schema


def check_connection() -> bool:
    return check_postgres_connection(settings.database_url)


def init_db() -> None:
    """Create the document-store table/indexes if they don't exist yet.
    Safe to call on every startup — every statement is CREATE ... IF NOT
    EXISTS."""
    ensure_schema(settings.database_url)
