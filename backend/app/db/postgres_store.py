"""
A small Mongo-like document store built on top of PostgreSQL's JSONB type.

This exists so the rest of the codebase (every module's repository.py) can
keep using the familiar `collection.find_one({...})` / `insert_one({...})`
API without a full rewrite to relational tables right now. It is NOT a toy:
- a single pooled set of real connections is reused across requests (no new
  TCP/TLS handshake per query),
- reads/writes go through transactions so read-modify-write (update_one) is
  race-free under concurrent requests,
- fields that must be unique (e.g. users.uid, users.email) are enforced by
  a real PostgreSQL unique index, not just "hope nobody collides",
- collection-scoped lookups are indexed, plus a GIN index on the JSONB
  payload for ad-hoc filtering.

The trade-off you're accepting by keeping this shape: most `find()` calls
still filter in Python after pulling the collection's rows (works fine at
this app's scale — thousands to low millions of rows per collection — but
is not a substitute for a proper relational schema if a collection grows
much larger or needs complex joins). If any single collection ever becomes
a hot path at scale, that's the one to peel off into a real typed table.
"""
from __future__ import annotations

import base64
import json
import re
import threading
from dataclasses import dataclass
from datetime import datetime, timezone

import psycopg
from psycopg.errors import UniqueViolation
from psycopg_pool import ConnectionPool
from bson import Binary, ObjectId


class DuplicateKeyError(Exception):
    """Raised when an insert/update would violate a unique index."""


_pools: dict[str, ConnectionPool] = {}
_pools_lock = threading.Lock()


def get_pool(database_url: str) -> ConnectionPool:
    pool = _pools.get(database_url)
    if pool is not None:
        return pool
    with _pools_lock:
        pool = _pools.get(database_url)
        if pool is None:
            pool = ConnectionPool(
                database_url,
                min_size=1,
                max_size=10,
                max_idle=300,
                timeout=10,
                kwargs={"autocommit": False},
            )
            _pools[database_url] = pool
    return pool


def _enc(v):
    if isinstance(v, ObjectId):
        return {"$oid": str(v)}
    if isinstance(v, datetime):
        if v.tzinfo is None:
            v = v.replace(tzinfo=timezone.utc)
        return {"$date": v.isoformat()}
    if isinstance(v, (bytes, bytearray, Binary)):
        return {"$binary": base64.b64encode(bytes(v)).decode()}
    if isinstance(v, dict):
        return {k: _enc(x) for k, x in v.items()}
    if isinstance(v, (list, tuple)):
        return [_enc(x) for x in v]
    return v


def _dec(v):
    if isinstance(v, dict):
        if set(v) == {"$oid"}:
            return ObjectId(v["$oid"])
        if set(v) == {"$date"}:
            return datetime.fromisoformat(v["$date"])
        if set(v) == {"$binary"}:
            return Binary(base64.b64decode(v["$binary"]))
        return {k: _dec(x) for k, x in v.items()}
    if isinstance(v, list):
        return [_dec(x) for x in v]
    return v


def _cmp(a, b):
    """Order-comparable compare that tolerates None / mixed types instead
    of raising, since a missing field is a common, valid case here."""
    if a is None or b is None:
        return None
    try:
        return (a > b) - (a < b)
    except TypeError:
        return None


def _match(d: dict, q: dict | None) -> bool:
    if not q:
        return True
    for k, e in q.items():
        if k == "$or":
            if not any(_match(d, x) for x in e):
                return False
            continue
        a = d.get(k)
        if isinstance(e, dict) and any(str(x).startswith("$") for x in e):
            for op, v in e.items():
                if op == "$in":
                    if not (a in v or (isinstance(a, list) and any(x in v for x in a))):
                        return False
                elif op == "$nin":
                    if a in v or (isinstance(a, list) and any(x in v for x in a)):
                        return False
                elif op == "$ne":
                    if a == v:
                        return False
                elif op == "$exists":
                    if (k in d) != bool(v):
                        return False
                elif op == "$lte":
                    c = _cmp(a, v)
                    if c is None or c > 0:
                        return False
                elif op == "$lt":
                    c = _cmp(a, v)
                    if c is None or c >= 0:
                        return False
                elif op == "$gte":
                    c = _cmp(a, v)
                    if c is None or c < 0:
                        return False
                elif op == "$gt":
                    c = _cmp(a, v)
                    if c is None or c <= 0:
                        return False
        elif isinstance(a, list):
            if e not in a:
                return False
        else:
            if a != e:
                return False
    return True


def _project(d: dict, p: dict | None) -> dict:
    if not p:
        return dict(d)
    inc = {k for k, v in p.items() if v}
    exc = {k for k, v in p.items() if not v}
    if inc:
        r = {k: d[k] for k in inc if k in d}
        if p.get("_id", 1) and "_id" in d:
            r["_id"] = d["_id"]
        return r
    return {k: v for k, v in d.items() if k not in exc}


class Cursor:
    def __init__(self, docs):
        self.docs = list(docs)

    def sort(self, key, direction):
        self.docs.sort(key=lambda x: (x.get(key) is None, x.get(key)), reverse=direction < 0)
        return self

    def limit(self, n):
        self.docs = self.docs[:n]
        return self

    def __iter__(self):
        return iter(self.docs)

    def __len__(self):
        return len(self.docs)


@dataclass
class InsertResult:
    inserted_id: object


@dataclass
class DeleteResult:
    deleted_count: int


@dataclass
class UpdateResult:
    modified_count: int
    upserted_id: object = None


_UNIQUE_FIELDS: dict[str, list[str]] = {
    "users": ["uid", "email"],
}


def ensure_schema(database_url: str) -> None:
    pool = get_pool(database_url)
    with pool.connection() as conn:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS app_documents (
                collection TEXT NOT NULL,
                id TEXT NOT NULL,
                data JSONB NOT NULL,
                updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
                PRIMARY KEY (collection, id)
            )
            """
        )
        conn.execute("CREATE INDEX IF NOT EXISTS app_documents_collection_idx ON app_documents (collection)")
        conn.execute("CREATE INDEX IF NOT EXISTS app_documents_data_gin_idx ON app_documents USING GIN (data)")
        for collection, fields in _UNIQUE_FIELDS.items():
            for field in fields:
                if not re.fullmatch(r"[a-z_]+", collection) or not re.fullmatch(r"[a-z_]+", field):
                    raise ValueError(f"unsafe identifier in _UNIQUE_FIELDS: {collection}.{field}")
                index_name = f"uq_{collection}_{field}"
                conn.execute(
                    f'CREATE UNIQUE INDEX IF NOT EXISTS "{index_name}" '
                    f"ON app_documents ((data ->> '{field}')) WHERE collection = '{collection}'"
                )
        conn.commit()


def check_postgres_connection(database_url: str) -> bool:
    try:
        pool = get_pool(database_url)
        with pool.connection() as conn:
            conn.execute("SELECT 1")
        return True
    except Exception:
        return False


class PostgresCollection:
    def __init__(self, name: str, database_url: str):
        self.name = name
        self.database_url = database_url

    def _pool(self) -> ConnectionPool:
        return get_pool(self.database_url)

    def _all(self) -> list[dict]:
        with self._pool().connection() as conn:
            rows = conn.execute(
                "SELECT data FROM app_documents WHERE collection = %s", (self.name,)
            ).fetchall()
        return [_dec(row[0]) for row in rows]

    def _save(self, conn, doc: dict) -> None:
        conn.execute(
            """
            INSERT INTO app_documents (collection, id, data, updated_at)
            VALUES (%s, %s, %s::jsonb, now())
            ON CONFLICT (collection, id) DO UPDATE SET data = EXCLUDED.data, updated_at = now()
            """,
            (self.name, str(doc["_id"]), json.dumps(_enc(doc))),
        )

    def find(self, q: dict | None = None, p: dict | None = None) -> Cursor:
        return Cursor(_project(d, p) for d in self._all() if _match(d, q))

    def find_one(self, q: dict | None = None, p: dict | None = None, **kw) -> dict | None:
        cur = self.find(q, p)
        sort = kw.get("sort")
        if sort:
            for key, direction in reversed(sort):
                cur.sort(key, direction)
        return cur.docs[0] if cur.docs else None

    def count_documents(self, q: dict | None = None) -> int:
        return sum(1 for d in self._all() if _match(d, q))

    def insert_one(self, doc: dict) -> InsertResult:
        doc = dict(doc)
        doc.setdefault("_id", ObjectId())
        try:
            with self._pool().connection() as conn:
                with conn.transaction():
                    self._save(conn, doc)
        except UniqueViolation as exc:
            raise DuplicateKeyError(str(exc)) from exc
        return InsertResult(doc["_id"])

    def update_one(self, q: dict, u: dict, upsert: bool = False) -> UpdateResult:
        try:
            with self._pool().connection() as conn:
                with conn.transaction():
                    rows = conn.execute(
                        "SELECT id, data FROM app_documents WHERE collection = %s FOR UPDATE",
                        (self.name,),
                    ).fetchall()
                    docs = [_dec(row[1]) for row in rows]
                    match = next((d for d in docs if _match(d, q)), None)
                    created = match is None
                    if created:
                        if not upsert:
                            return UpdateResult(0)
                        match = {k: v for k, v in q.items() if not k.startswith("$") and not isinstance(v, dict)}
                        match.setdefault("_id", ObjectId())
                    for k, v in u.get("$set", {}).items():
                        match[k] = v
                    if created:
                        for k, v in u.get("$setOnInsert", {}).items():
                            match.setdefault(k, v)
                    for k, v in u.get("$pull", {}).items():
                        match[k] = [x for x in match.get(k, []) if x != v]
                    for k, v in u.get("$inc", {}).items():
                        match[k] = (match.get(k) or 0) + v
                    self._save(conn, match)
        except UniqueViolation as exc:
            raise DuplicateKeyError(str(exc)) from exc
        return UpdateResult(1, match["_id"] if created else None)

    def update_many(self, q: dict, u: dict) -> UpdateResult:
        docs = [d for d in self._all() if _match(d, q)]
        for d in docs:
            self.update_one({"_id": d["_id"]}, u)
        return UpdateResult(len(docs))

    def delete_one(self, q: dict) -> DeleteResult:
        doc = next((d for d in self._all() if _match(d, q)), None)
        if not doc:
            return DeleteResult(0)
        with self._pool().connection() as conn:
            with conn.transaction():
                conn.execute(
                    "DELETE FROM app_documents WHERE collection = %s AND id = %s",
                    (self.name, str(doc["_id"])),
                )
        return DeleteResult(1)

    def delete_many(self, q: dict) -> DeleteResult:
        docs = [d for d in self._all() if _match(d, q)]
        if not docs:
            return DeleteResult(0)
        ids = [str(d["_id"]) for d in docs]
        with self._pool().connection() as conn:
            with conn.transaction():
                conn.execute(
                    "DELETE FROM app_documents WHERE collection = %s AND id = ANY(%s)",
                    (self.name, ids),
                )
        return DeleteResult(len(docs))

    def create_index(self, *args, **kwargs) -> None:
        return None
