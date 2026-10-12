import path from "node:path";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { db } from "./index";

/** Applies any pending migrations from ./drizzle. Already-applied migrations are skipped. */
export async function runMigrations() {
  await migrate(db, { migrationsFolder: path.join(process.cwd(), "drizzle") });
}
