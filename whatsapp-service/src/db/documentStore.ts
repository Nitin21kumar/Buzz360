import { newObjectId } from "./objectId";
import { getPool } from "./pool";

export class DuplicateKeyError extends Error {}

type Json = Record<string, unknown>;


function isPlainObject(v: unknown): v is Json {
  return typeof v === "object" && v !== null && !Array.isArray(v) && !(v instanceof Date);
}

function encodeValue(v: unknown): unknown {
  if (v instanceof Date) {
    return { $date: v.toISOString() };
  }
  if (Array.isArray(v)) {
    return v.map(encodeValue);
  }
  if (isPlainObject(v)) {
    const out: Json = {};
    for (const [k, val] of Object.entries(v)) out[k] = encodeValue(val);
    return out;
  }
  return v;
}

function decodeValue(v: unknown): unknown {
  if (Array.isArray(v)) {
    return v.map(decodeValue);
  }
  if (isPlainObject(v)) {
    const keys = Object.keys(v);
    if (keys.length === 1 && keys[0] === "$date") {
      return new Date(v["$date"] as string);
    }
    if (keys.length === 1 && keys[0] === "$oid") {
      return v["$oid"] as string;
    }
    const out: Json = {};
    for (const [k, val] of Object.entries(v)) out[k] = decodeValue(val);
    return out;
  }
  return v;
}


function cmp(a: unknown, b: unknown): number | null {
  if (a === null || a === undefined || b === null || b === undefined) return null;
  if (a instanceof Date && b instanceof Date) {
    return a.getTime() === b.getTime() ? 0 : a.getTime() < b.getTime() ? -1 : 1;
  }
  if (typeof a === typeof b && (typeof a === "number" || typeof a === "string")) {
    return a === b ? 0 : a < (b as any) ? -1 : 1;
  }
  return null;
}

export function matches(doc: Json, query: Json | undefined | null): boolean {
  if (!query) return true;
  for (const [key, expected] of Object.entries(query)) {
    if (key === "$or") {
      const clauses = expected as Json[];
      if (!clauses.some((c) => matches(doc, c))) return false;
      continue;
    }
    const actual = doc[key];
    if (isPlainObject(expected) && Object.keys(expected).some((k) => k.startsWith("$"))) {
      for (const [op, val] of Object.entries(expected)) {
        if (op === "$in") {
          const list = val as unknown[];
          const arrMatch = Array.isArray(actual) && actual.some((x) => list.includes(x));
          if (!(list.includes(actual) || arrMatch)) return false;
        } else if (op === "$nin") {
          const list = val as unknown[];
          const arrMatch = Array.isArray(actual) && actual.some((x) => list.includes(x));
          if (list.includes(actual) || arrMatch) return false;
        } else if (op === "$ne") {
          if (actual === val) return false;
        } else if (op === "$exists") {
          const has = Object.prototype.hasOwnProperty.call(doc, key);
          if (has !== Boolean(val)) return false;
        } else if (op === "$lte") {
          const c = cmp(actual, val);
          if (c === null || c > 0) return false;
        } else if (op === "$lt") {
          const c = cmp(actual, val);
          if (c === null || c >= 0) return false;
        } else if (op === "$gte") {
          const c = cmp(actual, val);
          if (c === null || c < 0) return false;
        } else if (op === "$gt") {
          const c = cmp(actual, val);
          if (c === null || c <= 0) return false;
        }
      }
    } else if (Array.isArray(actual)) {
      if (!actual.includes(expected)) return false;
    } else if (actual !== expected) {
      return false;
    }
  }
  return true;
}


const SAFE_FIELD = /^[a-zA-Z_][a-zA-Z0-9_]*$/;
const SCALAR = new Set(["string", "number", "boolean"]);

function isScalar(v: unknown): boolean {
  return v === null || SCALAR.has(typeof v);
}

interface WhereParts {
  clause: string;
  params: unknown[];
  residual: Json;
}

function buildWhere(query?: Json | null): WhereParts {
  const params: unknown[] = [];
  const clauses: string[] = [];
  const residual: Json = {};

  if (query) {
    for (const [key, val] of Object.entries(query)) {
      if (key === "$or" || !SAFE_FIELD.test(key)) {
        residual[key] = val;
        continue;
      }
      const col = key === "_id" ? "id" : `data->>'${key}'`;
      if (isScalar(val)) {
        params.push(val === null ? null : String(val));
        clauses.push(val === null ? `${col} IS NULL` : `${col} = $${params.length + 1}`);
        if (val === null) params.pop();
      } else if (
        isPlainObject(val) &&
        Object.keys(val).length === 1 &&
        Array.isArray((val as Json).$in) &&
        ((val as Json).$in as unknown[]).every(isScalar)
      ) {
        const arr = ((val as Json).$in as unknown[]).map((x) => (x === null ? null : String(x)));
        params.push(arr);
        clauses.push(`${col} = ANY($${params.length + 1})`);
      } else {
        residual[key] = val;
      }
    }
  }

  return {
    clause: clauses.length ? ` AND ${clauses.join(" AND ")}` : "",
    params,
    residual,
  };
}

function hasResidual(r: Json): boolean {
  return Object.keys(r).length > 0;
}

export interface UpdateOps {
  $set?: Json;
  $setOnInsert?: Json;
  $inc?: Record<string, number>;
  $pull?: Json;
}

export class Collection<T extends { _id?: string } = Json> {
  constructor(private readonly name: string) {}

  private async rows(query?: Json | null): Promise<T[]> {
    const { clause, params, residual } = buildWhere(query);
    const { rows } = await getPool().query(
      `SELECT data FROM app_documents WHERE collection = $1${clause}`,
      [this.name, ...params]
    );
    let docs = rows.map((r) => decodeValue(r.data) as T);
    if (hasResidual(residual)) docs = docs.filter((d) => matches(d as Json, residual));
    return docs;
  }

  async find(query?: Json): Promise<T[]> {
    return this.rows(query);
  }

  async findOne(query?: Json, sort?: [string, 1 | -1]): Promise<T | null> {
    let docs = await this.rows(query);
    if (sort) {
      const [field, dir] = sort;
      docs = [...docs].sort((a: any, b: any) => {
        const av = a[field];
        const bv = b[field];
        if (av === bv) return 0;
        return (av < bv ? -1 : 1) * dir;
      });
    }
    return docs[0] ?? null;
  }

  async countDocuments(query?: Json): Promise<number> {
    const { clause, params, residual } = buildWhere(query);
    if (!hasResidual(residual)) {
      const { rows } = await getPool().query(
        `SELECT count(*)::int AS n FROM app_documents WHERE collection = $1${clause}`,
        [this.name, ...params]
      );
      return rows[0]?.n ?? 0;
    }
    return (await this.rows(query)).length;
  }

  private async save(id: string, doc: T): Promise<void> {
    const payload = encodeValue({ ...doc, _id: id });
    try {
      await getPool().query(
        `INSERT INTO app_documents (collection, id, data, updated_at)
         VALUES ($1, $2, $3::jsonb, now())
         ON CONFLICT (collection, id) DO UPDATE SET data = EXCLUDED.data, updated_at = now()`,
        [this.name, id, JSON.stringify(payload)]
      );
    } catch (err: any) {
      if (err?.code === "23505") throw new DuplicateKeyError(err.message);
      throw err;
    }
  }

  async insertOne(doc: T): Promise<{ insertedId: string }> {
    const id = (doc as any)._id ?? newObjectId();
    await this.save(id, doc);
    return { insertedId: id };
  }

  async insertMany(docs: T[]): Promise<number> {
    if (!docs.length) return 0;
    const params: unknown[] = [this.name];
    const tuples: string[] = [];
    for (const doc of docs) {
      const id = (doc as any)._id ?? newObjectId();
      (doc as any)._id = id;
      const idPos = params.push(id);
      const dataPos = params.push(JSON.stringify(encodeValue({ ...doc, _id: id })));
      tuples.push(`($1, $${idPos}, $${dataPos}::jsonb, now())`);
    }
    const { rowCount } = await getPool().query(
      `INSERT INTO app_documents (collection, id, data, updated_at)
       VALUES ${tuples.join(", ")}
       ON CONFLICT (collection, id) DO NOTHING`,
      params
    );
    return rowCount ?? 0;
  }

  async updateOne(
    query: Json,
    update: UpdateOps,
    upsert = false
  ): Promise<{ modifiedCount: number; upsertedId: string | null }> {
    const docs = await this.rows(query);
    let match = docs[0] as any;
    const created = !match;

    if (created) {
      if (!upsert) return { modifiedCount: 0, upsertedId: null };
      match = {};
      for (const [k, v] of Object.entries(query)) {
        if (!k.startsWith("$") && !isPlainObject(v)) match[k] = v;
      }
      match._id = match._id ?? newObjectId();
    }

    if (update.$set) Object.assign(match, update.$set);
    if (created && update.$setOnInsert) {
      for (const [k, v] of Object.entries(update.$setOnInsert)) {
        if (!(k in match)) match[k] = v;
      }
    }
    if (update.$pull) {
      for (const [k, v] of Object.entries(update.$pull)) {
        match[k] = (match[k] || []).filter((x: unknown) => x !== v);
      }
    }
    if (update.$inc) {
      for (const [k, v] of Object.entries(update.$inc)) {
        match[k] = (match[k] || 0) + v;
      }
    }

    await this.save(match._id, match);
    return { modifiedCount: 1, upsertedId: created ? match._id : null };
  }

  async updateManyWhere(query: Json, patch: Json): Promise<number> {
    const { clause, params, residual } = buildWhere(query);
    const encoded = JSON.stringify(encodeValue(patch));
    if (!hasResidual(residual)) {
      const { rowCount } = await getPool().query(
        `UPDATE app_documents
         SET data = data || $${params.length + 2}::jsonb, updated_at = now()
         WHERE collection = $1${clause}`,
        [this.name, ...params, encoded]
      );
      return rowCount ?? 0;
    }
    const docs = await this.rows(query);
    return this.patchMany(
      docs.map((d) => (d as any)._id).filter(Boolean),
      patch
    );
  }

  async patchMany(ids: string[], patch: Json): Promise<number> {
    if (!ids.length) return 0;
    const encoded = JSON.stringify(encodeValue(patch));
    const { rowCount } = await getPool().query(
      `UPDATE app_documents
       SET data = data || $3::jsonb, updated_at = now()
       WHERE collection = $1 AND id = ANY($2)`,
      [this.name, ids, encoded]
    );
    return rowCount ?? 0;
  }

  async compareAndPatch(id: string, field: string, expected: string, patch: Json): Promise<boolean> {
    if (!SAFE_FIELD.test(field)) throw new Error(`unsafe field name: ${field}`);
    const encoded = JSON.stringify(encodeValue(patch));
    const { rowCount } = await getPool().query(
      `UPDATE app_documents
       SET data = data || $4::jsonb, updated_at = now()
       WHERE collection = $1 AND id = $2 AND data->>'${field}' = $3`,
      [this.name, id, expected, encoded]
    );
    return (rowCount ?? 0) > 0;
  }

  async deleteOne(query: Json): Promise<{ deletedCount: number }> {
    const doc = (await this.rows(query))[0] as any;
    if (!doc) return { deletedCount: 0 };
    await getPool().query("DELETE FROM app_documents WHERE collection = $1 AND id = $2", [this.name, doc._id]);
    return { deletedCount: 1 };
  }

  async deleteMany(query: Json): Promise<{ deletedCount: number }> {
    const { clause, params, residual } = buildWhere(query);
    if (!hasResidual(residual)) {
      const { rowCount } = await getPool().query(
        `DELETE FROM app_documents WHERE collection = $1${clause}`,
        [this.name, ...params]
      );
      return { deletedCount: rowCount ?? 0 };
    }
    const docs = (await this.rows(query)) as any[];
    if (!docs.length) return { deletedCount: 0 };
    const ids = docs.map((d) => d._id);
    await getPool().query("DELETE FROM app_documents WHERE collection = $1 AND id = ANY($2)", [this.name, ids]);
    return { deletedCount: docs.length };
  }
}

export async function ensureSchema(): Promise<void> {
  const pool = getPool();
  await pool.query(`
    CREATE TABLE IF NOT EXISTS app_documents (
      collection TEXT NOT NULL,
      id TEXT NOT NULL,
      data JSONB NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      PRIMARY KEY (collection, id)
    )
  `);
  await pool.query("CREATE INDEX IF NOT EXISTS app_documents_collection_idx ON app_documents (collection)");
  await pool.query("CREATE INDEX IF NOT EXISTS app_documents_data_gin_idx ON app_documents USING GIN (data)");

  const ident = /^[a-z_]+$/;
  const safe = (s: string) => {
    if (!ident.test(s)) throw new Error(`unsafe identifier: ${s}`);
    return s;
  };

  const uniqueFields: Record<string, string[]> = { users: ["uid", "email"] };
  for (const [collection, fields] of Object.entries(uniqueFields)) {
    for (const field of fields) {
      safe(collection);
      safe(field);
      await pool.query(
        `CREATE UNIQUE INDEX IF NOT EXISTS "uq_${collection}_${field}"
         ON app_documents ((data ->> '${field}')) WHERE collection = '${collection}'`
      );
    }
  }

  const lookupIndexes: Array<[string, string]> = [
    ["whatsapp_contacts", "campaign_id"],
    ["whatsapp_contacts", "log_id"],
    ["whatsapp_contacts", "phone_number"],
    ["whatsapp_contacts", "status"],
    ["rcs_contacts", "campaign_id"],
    ["rcs_contacts", "log_id"],
    ["rcs_contacts", "phone_number"],
    ["rcs_contacts", "status"],
    ["whatsapp_campaigns", "status"],
    ["whatsapp_campaigns", "created_by"],
    ["rcs_campaigns", "status"],
    ["rcs_campaigns", "created_by"],
  ];
  for (const [collection, field] of lookupIndexes) {
    safe(collection);
    safe(field);
    await pool.query(
      `CREATE INDEX IF NOT EXISTS "ix_${collection}_${field}"
       ON app_documents ((data ->> '${field}')) WHERE collection = '${collection}'`
    );
  }
}
