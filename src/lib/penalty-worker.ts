import "server-only";
import { runLoanReminders } from "./loan-notifications";
import { runPenaltyAutomation } from "./penalty-automation";

const globalWorker = globalThis as unknown as { penaltyWorker?: ReturnType<typeof setInterval> };
export function startPenaltyWorker() {
  if (
    globalWorker.penaltyWorker ||
    (process.env.NODE_ENV !== "production" && process.env.PENALTY_WORKER_ENABLED !== "true")
  )
    return;
  let busy = false;
  const tick = async () => {
    if (busy) return;
    busy = true;
    try {
      await runLoanReminders();
      await runPenaltyAutomation();
    } catch {
      console.error("Penalty worker failed; it will retry on the next scheduled check.");
    } finally {
      busy = false;
    }
  };
  globalWorker.penaltyWorker = setInterval(() => {
    void tick();
  }, 5 * 60_000);
  globalWorker.penaltyWorker.unref();
  void tick();
}
