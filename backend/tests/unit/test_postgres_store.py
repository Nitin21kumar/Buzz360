from datetime import datetime, timedelta

from app.db.postgres_store import _match


def test_equality_and_in():
    doc = {"status": "draft", "role": "admin"}
    assert _match(doc, {"status": "draft"})
    assert not _match(doc, {"status": "running"})
    assert _match(doc, {"role": {"$in": ["admin", "user"]}})
    assert not _match(doc, {"role": {"$in": ["user"]}})


def test_ne_and_exists():
    doc = {"handoff": True}
    assert _match(doc, {"handoff": {"$ne": False}})
    assert not _match(doc, {"handoff": {"$ne": True}})
    assert _match(doc, {"handoff": {"$exists": True}})
    assert not _match(doc, {"missing_field": {"$exists": True}})


def test_lte_actually_filters():
    """Regression test: the original hand-rolled Postgres query shim didn't
    implement $lte at all, so `{"next_retry_at": {"$lte": now}}` (used by
    the SMS duplicate-retry worker) silently matched every document
    instead of only due ones. This must now correctly exclude future
    dates."""
    now = datetime(2026, 1, 1, 12, 0, 0)
    past = now - timedelta(hours=1)
    future = now + timedelta(hours=1)

    assert _match({"next_retry_at": past}, {"next_retry_at": {"$lte": now}})
    assert _match({"next_retry_at": now}, {"next_retry_at": {"$lte": now}})
    assert not _match({"next_retry_at": future}, {"next_retry_at": {"$lte": now}})


def test_gte_and_lt_and_gt():
    assert _match({"n": 5}, {"n": {"$gte": 5}})
    assert not _match({"n": 4}, {"n": {"$gte": 5}})
    assert _match({"n": 4}, {"n": {"$lt": 5}})
    assert not _match({"n": 5}, {"n": {"$lt": 5}})
    assert _match({"n": 6}, {"n": {"$gt": 5}})
    assert not _match({"n": 5}, {"n": {"$gt": 5}})


def test_or():
    doc = {"role": "user"}
    assert _match(doc, {"$or": [{"role": "admin"}, {"role": "user"}]})
    assert not _match(doc, {"$or": [{"role": "admin"}, {"role": "super_admin"}]})
