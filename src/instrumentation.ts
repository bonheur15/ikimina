// Runs once when the Next.js server starts, before it handles requests.
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not set. Copy .env.example to .env.local.");
  const { runMigrations } = await import("./db/migrate");
  await runMigrations();
  const { startPenaltyWorker } = await import("./lib/penalty-worker");
  startPenaltyWorker();
}
