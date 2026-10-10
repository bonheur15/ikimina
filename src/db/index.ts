import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import * as schema from "./schema";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is not set. Copy .env.example to .env.local.");

// Reuse one connection pool across hot reloads in development.
const globalForDb = globalThis as unknown as { ikiminaSql?: postgres.Sql };
const sql = globalForDb.ikiminaSql ?? postgres(url, { max: 10 });
if (process.env.NODE_ENV !== "production") globalForDb.ikiminaSql = sql;

export const db = drizzle(sql, { schema });
export { sql };
export type Db = typeof db;
