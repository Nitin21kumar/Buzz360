import { Pool } from "pg";

import { config } from "../core/config";

let pool: Pool | null = null;

function wantsSsl(url: string): boolean {
  const override = (process.env.DATABASE_SSL || "").toLowerCase();
  if (override === "on" || override === "true" || override === "require") return true;
  if (override === "off" || override === "false" || override === "disable") return false;
  if (/[?&]sslmode=(disable|off)/i.test(url)) return false;
  return !/@(localhost|127\.0\.0\.1|\[::1\]|postgres|db|database)[:/]/i.test(url);
}

export function getPool(): Pool {
  if (!pool) {
    pool = new Pool({
      connectionString: config.databaseUrl,
      max: 10,
      idleTimeoutMillis: 300_000,
      connectionTimeoutMillis: 10_000,
      ...(wantsSsl(config.databaseUrl) ? { ssl: { rejectUnauthorized: false } } : {}),
    });
  }
  return pool;
}

export async function checkPostgresConnection(): Promise<boolean> {
  try {
    const client = await getPool().connect();
    try {
      await client.query("SELECT 1");
      return true;
    } finally {
      client.release();
    }
  } catch {
    return false;
  }
}
