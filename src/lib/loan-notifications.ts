import "server-only";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { financeRequests, loanBackings, pushNotifications, users } from "@/db/schema";
import { getLoanBalance } from "./loan-service";
import { getNotificationPolicy } from "./notification-settings";
import { kigaliToday, money } from "./portal-data";

export async function runLoanReminders(now = new Date()) {
  const policy = await getNotificationPolicy();
  if (!policy.enabled) return { queued: 0, overdue: 0 };
  let queued = 0,
    overdue = 0;
  const loans = await db
    .select()
    .from(financeRequests)
    .where(and(eq(financeRequests.kind, "loan"), eq(financeRequests.status, "paid")));
  for (const loan of loans) {
    const balance = await getLoanBalance(db, loan, now);
    if (!balance.dueAt || balance.outstanding <= 0) continue;
    const today = kigaliToday(now),
      dueOn = kigaliToday(balance.dueAt);
    const daysUntil = Math.ceil((Date.parse(`${dueOn}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86400000);
    const isOverdue = balance.overdueDays > 0;
    if (isOverdue) overdue++;
    if (isOverdue ? !policy.overdue : daysUntil < 0 || daysUntil > policy.dueSoonDays) continue;
    const bucket = isOverdue ? Math.floor(Date.parse(`${today}T00:00:00Z`) / 86400000 / policy.repeatDays) : "due-soon";
    const recipients = new Set([loan.memberId]);
    if (isOverdue && policy.notifyBackers)
      for (const b of await db.select().from(loanBackings).where(eq(loanBackings.requestId, loan.id)))
        if (b.status === "approved") recipients.add(b.memberId);
    await db.transaction(async (tx) => {
      for (const memberId of recipients) {
        const accounts = await tx
          .select({ id: users.id })
          .from(users)
          .where(and(eq(users.memberId, memberId), isNull(users.disabledAt)));
        for (const account of accounts) {
          const inserted = await tx
            .insert(pushNotifications)
            .values({
              userId: account.id,
              eventKey: `loan-reminder:${loan.id}:${isOverdue ? "overdue" : "due"}:${bucket}:${account.id}`,
              title: isOverdue ? "Loan repayment overdue" : "Loan repayment due soon",
              body:
                memberId === loan.memberId
                  ? `Your loan balance is ${money(balance.outstanding)} RWF${isOverdue ? " and is overdue" : `, due ${dueOn}`}. Open Elayo Family for the current repayment amount.`
                  : "A loan backed by your savings is overdue. Open Elayo Family to review your backing.",
              path: "/member?view=money",
            })
            .onConflictDoNothing()
            .returning({ id: pushNotifications.id });
          queued += inserted.length;
        }
      }
    });
  }
  return { queued, overdue };
}
