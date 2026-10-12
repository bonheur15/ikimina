import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import * as schema from "./schema";

// Connections open on the first query, so building the app doesn't need a database.
// The server checks DATABASE_URL at start-up (src/instrumentation.ts).
const globalForDb = globalThis as unknown as { ikiminaSql?: postgres.Sql };
const sql = globalForDb.ikiminaSql ?? postgres(process.env.DATABASE_URL ?? "", { max: 10, onnotice: () => {} });
if (process.env.NODE_ENV !== "production") globalForDb.ikiminaSql = sql;

export const db = drizzle(sql, { schema });
export { sql };
export type Db = typeof db;
