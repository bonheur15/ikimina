"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  createStaffAccount,
  saveLoanPolicy,
  saveNotificationSettings,
  savePaymentSettings,
  staffSignInLink,
  testPaymentConnection,
  triggerNotifications,
  updateStaffAccess,
} from "@/app/actions/governance";
import type { LoanPolicy } from "@/lib/loan-policy";
import type { NotificationPolicy } from "@/lib/notification-settings";
import { roleLabel, type Role } from "@/lib/permissions";
import { Action, SectionHeading } from "./portal-ui";
import { Choice } from "./ui/choice";

type Account = { id: string; name: string; email: string | null; role: Role; disabled: boolean; ready: boolean };
type Notifications = {
  appId: string;
  siteUrl: string;
  hasKey: boolean;
  configured: boolean;
  policy: NotificationPolicy;
  pending: number;
  failed: number;
};
type PaymentMode = "test" | "live";
type KeySlot = { source: "dashboard" | "environment" | null; hasKey: boolean; hasSecret: boolean; unreadable: boolean };
type Payments = {
  mode: PaymentMode;
  feeBps: number;
  configured: boolean;
  disabled: boolean;
  slots: Record<PaymentMode, KeySlot>;
  webhookUrl: string;
};
type Result = { ok: boolean; error?: string };
function useOperation() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const run = (work: () => Promise<Result>, success: string) =>
    start(async () => {
      setMessage("");
      setError("");
      try {
        const result = await work();
        if (!result.ok) setError(result.error ?? "Operation failed.");
        else {
          setMessage(success);
          router.refresh();
        }
      } catch {
        setError("Could not complete this operation. Refresh before retrying.");
      }
    });
  return {
    run,
    pending,
    feedback: (
      <>
        {error && (
          <p role="alert" className="form-error">
            {error}
          </p>
        )}
        {message && (
          <p role="status" className="form-success">
            {message}
          </p>
        )}
      </>
    ),
  };
}
const NumberField = ({
  name,
  label,
  value,
  min = 0,
  max = 100000000,
  step = "1",
}: {
  name: string;
  label: string;
  value: number;
  min?: number;
  max?: number;
  step?: string;
}) => (
  <label className="field">
    {label}
    <input type="number" name={name} defaultValue={value} min={min} max={max} step={step} required />
  </label>
);
const Pick = ({
  name,
  label,
  value,
  options,
}: {
  name: string;
  label: string;
  value: string;
  options: [string, string][];
}) => (
  <div className="field">
    {label}
    <Choice
      name={name}
      defaultValue={value}
      ariaLabel={label}
      options={options.map(([value, label]) => ({ value, label }))}
    />
  </div>
);
const CheckField = ({ name, label, value }: { name: string; label: string; value: boolean }) => (
  <label className="penalty-check">
    <input type="checkbox" name={name} defaultChecked={value} />
    {label}
  </label>
);

export function GovernancePanel({
  role,
  bootstrap,
  accounts,
  policy,
  payments,
  notifications,
}: {
  role: Role;
  bootstrap: boolean;
  accounts: Account[];
  policy: LoanPolicy | null;
  payments: Payments | null;
  notifications: Notifications | null;
}) {
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">ELAYO GOVERNANCE</span>
          <h1>
            Roles & policies<span className="heading-dot">.</span>
          </h1>
          <p>
            Superadmin controls accounts, lending rules, payment keys and notifications. Managers approve loans; the
            secretary manages records.
          </p>
        </div>
      </div>
      <section className="panel finance-section">
        <SectionHeading title="Role responsibilities" />
        <div className="table-wrap">
          <table className="record-table">
            <thead>
              <tr>
                <th>Role</th>
                <th>Access</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Superadmin</td>
                <td>Accounts, loan policy, XendlyPay keys, OneSignal settings, manual reminders and records</td>
              </tr>
              <tr>
                <td>Secretary</td>
                <td>Members, contributions, cashbook, penalties and approved disbursements</td>
              </tr>
              <tr>
                <td>Manager</td>
                <td>Read group records and reports; approve or decline loan requests</td>
              </tr>
              <tr>
                <td>Member</td>
                <td>Own savings, contributions, borrowing, backing decisions and repayments</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
      {(role === "superadmin" || bootstrap) && <StaffCreation bootstrap={bootstrap} />}
      {role === "secretary" && !bootstrap && !accounts.length && (
        <p className="finance-notice">
          A superadmin account already exists. Sign in with that account to manage lending rules and notifications.
        </p>
      )}
      {!!accounts.length && (
        <section className="panel finance-section">
          <SectionHeading title={role === "superadmin" ? "Accounts & access" : "First superadmin invitation"} />
          {accounts.map((account) => (
            <AccountAccess key={account.id} account={account} editable={role === "superadmin"} />
          ))}
        </section>
      )}
      {policy && <LoanPolicyForm key={policy.version} policy={policy} />}
      {payments && <PaymentForm key={JSON.stringify(payments)} data={payments} />}
      {notifications && (
        <NotificationForm key={`${notifications.appId}:${JSON.stringify(notifications.policy)}`} data={notifications} />
      )}
    </>
  );
}
function StaffCreation({ bootstrap }: { bootstrap: boolean }) {
  const op = useOperation();
  const [link, setLink] = useState("");
  return (
    <section className="panel finance-section">
      <SectionHeading
        title={bootstrap ? "Create the first superadmin" : "Create a staff account"}
        subtitle="A separate account receives a one-use link to choose its own password. Share that link privately."
      />
      <form
        className="portal-form"
        onSubmit={(e) => {
          e.preventDefault();
          const form = new FormData(e.currentTarget);
          op.run(async () => {
            const result = await createStaffAccount({
              name: String(form.get("name")),
              email: String(form.get("email")),
              role: bootstrap ? "superadmin" : (form.get("role") as "manager"),
            });
            if (result.ok) setLink(result.value.url);
            return result;
          }, "Account created. Share the invitation link below.");
        }}
      >
        <div className="form-grid">
          <label className="field">
            Name
            <input name="name" required minLength={2} maxLength={80} />
          </label>
          <label className="field">
            Email
            <input name="email" type="email" required maxLength={200} />
          </label>
        </div>
        {!bootstrap && (
          <Pick
            name="role"
            label="Role"
            value="manager"
            options={[
              ["manager", "Manager"],
              ["secretary", "Secretary"],
              ["superadmin", "Superadmin"],
            ]}
          />
        )}
        <Action type="submit" busy={op.pending}>
          Create account & invitation
        </Action>
        {op.feedback}
      </form>
      {link && (
        <label className="field">
          Invitation link
          <input readOnly value={link} onFocus={(e) => e.currentTarget.select()} />
        </label>
      )}
    </section>
  );
}
function AccountAccess({ account, editable }: { account: Account; editable: boolean }) {
  const op = useOperation();
  const [link, setLink] = useState("");
  return (
    <article className="finance-record">
      <div>
        <strong>{account.name}</strong>
        <small>
          {account.email} · {roleLabel(account.role)} · {account.ready ? "Password set" : "Awaiting password"}
          {account.disabled ? " · Disabled" : ""}
        </small>
        {editable && (
          <form
            className="portal-form"
            onSubmit={(e) => {
              e.preventDefault();
              const form = new FormData(e.currentTarget);
              op.run(
                () =>
                  updateStaffAccess({
                    id: account.id,
                    role: form.get("role") as Role,
                    disabled: form.get("disabled") === "on",
                  }),
                "Access updated.",
              );
            }}
          >
            <Pick
              name="role"
              label={`Role for ${account.name}`}
              value={account.role}
              options={[
                ["member", "Member"],
                ["secretary", "Secretary"],
                ["manager", "Manager"],
                ["superadmin", "Superadmin"],
              ]}
            />
            <CheckField name="disabled" label="Disable sign-in" value={account.disabled} />
            <Action type="submit" secondary busy={op.pending}>
              Save access
            </Action>
          </form>
        )}
        {link && (
          <input
            readOnly
            value={link}
            aria-label={`Invitation for ${account.name}`}
            onFocus={(e) => e.currentTarget.select()}
          />
        )}
        {op.feedback}
      </div>
      <Action
        secondary
        busy={op.pending}
        onClick={() =>
          op.run(async () => {
            const r = await staffSignInLink(account.id);
            if (r.ok) setLink(r.value.url);
            return r;
          }, "A new one-use link is ready.")
        }
      >
        {account.ready ? "Create password reset link" : "Create invitation link"}
      </Action>
    </article>
  );
}
function RuleFields({ name, title, rule }: { name: "savings" | "backed"; title: string; rule: LoanPolicy["savings"] }) {
  return (
    <fieldset className="governance-rule">
      <legend>{title}</legend>
      <CheckField name={`${name}.enabled`} label="Enable this loan type" value={rule.enabled} />
      <div className="form-grid">
        <NumberField
          name={`${name}.ratePercent`}
          label="Interest rate (%)"
          value={rule.rateBps / 100}
          max={100}
          step="0.01"
        />
        <NumberField
          name={`${name}.periodMonths`}
          label="Rate applies per (months)"
          value={rule.periodMonths}
          min={1}
          max={12}
        />
        <NumberField
          name={`${name}.maxMonths`}
          label="Maximum repayment period (months)"
          value={rule.maxMonths}
          min={1}
          max={120}
        />
        <NumberField
          name={`${name}.minAmount`}
          label="Minimum principal incl. payout fee (RWF)"
          value={rule.minAmount}
          min={10000}
        />
        <NumberField
          name={`${name}.maxAmount`}
          label="Maximum principal incl. payout fee (RWF)"
          value={rule.maxAmount}
          min={10000}
        />
        <Pick
          name={`${name}.method`}
          label="Interest calculation"
          value={rule.method}
          options={[
            ["simple", "Simple interest"],
            ["compound", "Compound interest"],
          ]}
        />
        <Pick
          name={`${name}.base`}
          label="Interest base"
          value={rule.base}
          options={[
            ["remaining", "Unpaid principal"],
            ["original", "Original principal"],
          ]}
        />
        <Pick
          name={`${name}.dayBasis`}
          label="Proration basis"
          value={rule.dayBasis}
          options={[
            ["calendar", "Actual calendar period"],
            ["30_day", "30 days per month"],
          ]}
        />
        <Pick
          name={`${name}.rounding`}
          label="Whole-franc rounding"
          value={rule.rounding}
          options={[
            ["ceil", "Round up"],
            ["nearest", "Round to nearest"],
            ["floor", "Round down"],
          ]}
        />
      </div>
      <CheckField
        name={`${name}.prorate`}
        label="Prorate incomplete periods, including early repayment"
        value={rule.prorate}
      />
      <CheckField
        name={`${name}.accrueAfterDue`}
        label="Continue interest after the due date"
        value={rule.accrueAfterDue}
      />
    </fieldset>
  );
}
function LoanPolicyForm({ policy }: { policy: LoanPolicy }) {
  const op = useOperation();
  return (
    <section className="panel finance-section">
      <SectionHeading
        title="Loan policy"
        subtitle="New requests keep a snapshot of these terms. Existing loans keep the terms their borrower and backers accepted."
      />
      <form
        className="portal-form"
        onSubmit={(e) => {
          e.preventDefault();
          const form = new FormData(e.currentTarget),
            num = (name: string) => Number(form.get(name)),
            text = (name: string) => String(form.get(name)),
            checked = (name: string) => form.get(name) === "on";
          const rule = (name: "savings" | "backed") => ({
            enabled: checked(`${name}.enabled`),
            rateBps: Math.round(num(`${name}.ratePercent`) * 100),
            periodMonths: num(`${name}.periodMonths`),
            maxMonths: num(`${name}.maxMonths`),
            minAmount: num(`${name}.minAmount`),
            maxAmount: num(`${name}.maxAmount`),
            method: text(`${name}.method`),
            base: text(`${name}.base`),
            dayBasis: text(`${name}.dayBasis`),
            rounding: text(`${name}.rounding`),
            prorate: checked(`${name}.prorate`),
            accrueAfterDue: checked(`${name}.accrueAfterDue`),
          });
          op.run(
            () =>
              saveLoanPolicy({
                processingFeeBps: Math.round(num("processingFeePercent") * 100),
                savings: rule("savings"),
                backed: rule("backed"),
                savingsLimitBps: Math.round(num("savingsLimitPercent") * 100),
                backerLimitBps: Math.round(num("backerLimitPercent") * 100),
                backingMode: text("backingMode"),
                release: text("release"),
                minBackers: num("minBackers"),
                maxBackers: num("maxBackers"),
                repaymentOrder: text("repaymentOrder"),
                graceDays: num("graceDays"),
                allowSelfApproval: checked("allowSelfApproval"),
              }),
            "Loan policy saved for new requests.",
          );
        }}
      >
        <div className="finance-grid">
          <RuleFields name="savings" title="Savings-backed loans" rule={policy.savings} />
          <RuleFields name="backed" title="Member-backed loans" rule={policy.backed} />
        </div>
        <div className="form-grid">
          <NumberField
            name="processingFeePercent"
            label="Non-refundable processing fee (%)"
            value={policy.processingFeeBps / 100}
            max={100}
            step="0.01"
          />
          <NumberField
            name="savingsLimitPercent"
            label="Own savings borrowing limit (%)"
            value={policy.savingsLimitBps / 100}
            min={0.01}
            max={100}
            step="0.01"
          />
          <NumberField
            name="backerLimitPercent"
            label="Each backer's savings limit (%)"
            value={policy.backerLimitBps / 100}
            min={0.01}
            max={100}
            step="0.01"
          />
          <Pick
            name="backingMode"
            label="Backing funds"
            value={policy.backingMode}
            options={[
              ["lock", "Lock savings"],
              ["deduct", "Deduct and restore savings"],
            ]}
          />
          <Pick
            name="release"
            label="Release backing"
            value={policy.release}
            options={[
              ["full_repayment", "After full repayment"],
              ["proportional", "As principal is repaid"],
            ]}
          />
          <NumberField name="minBackers" label="Minimum backing members" value={policy.minBackers} min={1} max={20} />
          <NumberField name="maxBackers" label="Maximum backing members" value={policy.maxBackers} min={1} max={20} />
          <Pick
            name="repaymentOrder"
            label="Apply repayments to"
            value={policy.repaymentOrder}
            options={[
              ["interest_first", "Interest first, then principal"],
              ["principal_first", "Principal first, then interest"],
            ]}
          />
          <NumberField name="graceDays" label="Overdue reminder grace (days)" value={policy.graceDays} max={365} />
        </div>
        <CheckField
          name="allowSelfApproval"
          label="Allow a manager to approve their own member loan"
          value={policy.allowSelfApproval}
        />
        <Action type="submit" busy={op.pending}>
          Save loan policy
        </Action>
        {op.feedback}
      </form>
    </section>
  );
}
const sourceLabel = (slot: KeySlot) =>
  slot.unreadable
    ? "Saved keys cannot be read (AUTH_SECRET changed); enter them again"
    : slot.source === "dashboard"
      ? slot.hasKey && slot.hasSecret
        ? "Saved here"
        : "Incomplete"
      : slot.source === "environment"
        ? "Using server environment keys"
        : "Not set";
function PaymentKeyFields({ mode, slot }: { mode: PaymentMode; slot: KeySlot }) {
  const saved = slot.source === "dashboard";
  return (
    <fieldset className="governance-rule">
      <legend>
        {mode === "test" ? "Test app keys" : "Live app keys"} · {sourceLabel(slot)}
      </legend>
      <label className="field">
        API key
        <input
          name={`${mode}.apiKey`}
          type="password"
          autoComplete="new-password"
          placeholder={saved && slot.hasKey ? "Stored securely; leave blank to keep it" : `Enter the ${mode} API key`}
        />
      </label>
      <label className="field">
        Webhook signing secret
        <input
          name={`${mode}.webhookSecret`}
          type="password"
          autoComplete="new-password"
          placeholder={
            saved && slot.hasSecret ? "Stored securely; leave blank to keep it" : `Enter the ${mode} webhook secret`
          }
        />
      </label>
      {saved && (
        <CheckField
          name={`${mode}.clear`}
          label={`Remove saved ${mode} keys (falls back to server environment keys, if any)`}
          value={false}
        />
      )}
    </fieldset>
  );
}
function PaymentForm({ data }: { data: Payments }) {
  const op = useOperation();
  const check = useOperation();
  const [result, setResult] = useState("");
  return (
    <section className="panel finance-section">
      <SectionHeading
        title="XendlyPay mobile money"
        subtitle={`${data.disabled ? "Paused" : data.configured ? "Connected" : "Awaiting connection"} · ${data.mode === "live" ? "Live" : "Test"} mode · ${data.feeBps / 100}% provider fee`}
      />
      <form
        className="portal-form"
        onSubmit={(e) => {
          e.preventDefault();
          const form = new FormData(e.currentTarget),
            text = (name: string) => String(form.get(name) ?? ""),
            keys = (mode: PaymentMode) => ({
              apiKey: text(`${mode}.apiKey`),
              webhookSecret: text(`${mode}.webhookSecret`),
              clear: form.get(`${mode}.clear`) === "on",
            });
          op.run(
            () =>
              savePaymentSettings({
                mode: text("mode"),
                feeBps: Math.round(Number(form.get("feePercent")) * 100),
                test: keys("test"),
                live: keys("live"),
                disabled: form.get("disabled") === "on",
              }),
            "Payment settings saved. New payments use these keys immediately.",
          );
        }}
      >
        <div className="form-grid">
          <Pick
            name="mode"
            label="Active mode for new payments"
            value={data.mode}
            options={[
              ["test", "Test (registered test phones only)"],
              ["live", "Live (real members, cashouts enabled)"],
            ]}
          />
          <NumberField
            name="feePercent"
            label="Provider fee members pay (%)"
            value={data.feeBps / 100}
            max={99.99}
            step="0.01"
          />
        </div>
        <div className="finance-grid">
          <PaymentKeyFields mode="test" slot={data.slots.test} />
          <PaymentKeyFields mode="live" slot={data.slots.live} />
        </div>
        <label className="field">
          Webhook URL to register in both XendlyPay apps
          <input readOnly value={data.webhookUrl} onFocus={(e) => e.currentTarget.select()} />
        </label>
        <p className="muted">
          Keys are encrypted on the server and never returned to this form. Keys saved here replace the server
          environment keys for that mode. Payments already started keep using the keys of the mode they were made in.
        </p>
        <CheckField name="disabled" label="Pause mobile money payments (keeps saved keys)" value={data.disabled} />
        <Action type="submit" busy={op.pending}>
          Save payment settings
        </Action>
        {op.feedback}
      </form>
      <hr />
      <div className="form-grid">
        {(["test", "live"] as const).map((mode) => (
          <Action
            key={mode}
            secondary
            busy={check.pending}
            onClick={() =>
              check.run(async () => {
                setResult("");
                const r = await testPaymentConnection(mode);
                if (r.ok)
                  setResult(
                    `${mode === "live" ? "Live" : "Test"} key accepted by XendlyPay${
                      r.value.available === undefined
                        ? ""
                        : ` · ${r.value.available.toLocaleString()} RWF available, ${(r.value.pending ?? 0).toLocaleString()} RWF pending`
                    }.`,
                  );
                return r;
              }, "Connection check completed.")
            }
          >
            Check {mode} connection
          </Action>
        ))}
      </div>
      {result && <p role="status">{result}</p>}
      {check.feedback}
    </section>
  );
}
function NotificationForm({ data }: { data: Notifications }) {
  const op = useOperation();
  const manual = useOperation();
  const [result, setResult] = useState("");
  return (
    <section className="panel finance-section">
      <SectionHeading
        title="OneSignal notifications"
        subtitle={`${data.configured ? "Connected" : "Awaiting connection"} · ${data.pending} queued · ${data.failed} delivery errors`}
      />
      <form
        className="portal-form"
        onSubmit={(e) => {
          e.preventDefault();
          const form = new FormData(e.currentTarget),
            checked = (name: string) => form.get(name) === "on",
            num = (name: string) => Number(form.get(name));
          op.run(
            () =>
              saveNotificationSettings({
                appId: String(form.get("appId")),
                apiKey: String(form.get("apiKey")),
                siteUrl: String(form.get("siteUrl")),
                clearKey: checked("clearKey"),
                policy: {
                  enabled: checked("enabled"),
                  loanUpdates: checked("loanUpdates"),
                  overdue: checked("overdue"),
                  notifyBackers: checked("notifyBackers"),
                  dueSoonDays: num("dueSoonDays"),
                  repeatDays: num("repeatDays"),
                  maxQueueAgeDays: num("maxQueueAgeDays"),
                },
              }),
            "Notification settings saved.",
          );
        }}
      >
        <div className="form-grid">
          <label className="field">
            OneSignal App ID
            <input name="appId" defaultValue={data.appId} />
          </label>
          <label className="field">
            OneSignal REST API key
            <input
              name="apiKey"
              type="password"
              autoComplete="new-password"
              placeholder={data.hasKey ? "Stored securely; leave blank to keep it" : "Enter your app's REST API key"}
            />
          </label>
          <label className="field">
            Public application URL
            <input
              name="siteUrl"
              type="url"
              defaultValue={data.siteUrl}
              required
              placeholder="https://elayo.example.com"
            />
          </label>
        </div>
        <p className="muted">
          The REST API key is encrypted on the server and is never returned to this form. Configure this origin in
          OneSignal Web Push. Members choose whether to enable notifications on their devices.
        </p>
        <CheckField name="enabled" label="Enable notification delivery" value={data.policy.enabled} />
        <CheckField
          name="loanUpdates"
          label="Notify backing invitations, decisions, disbursements and repayments"
          value={data.policy.loanUpdates}
        />
        <CheckField name="overdue" label="Notify members about overdue loans" value={data.policy.overdue} />
        <CheckField
          name="notifyBackers"
          label="Also notify backing members when a loan is overdue"
          value={data.policy.notifyBackers}
        />
        <div className="form-grid">
          <NumberField
            name="dueSoonDays"
            label="Reminder before due date (days)"
            value={data.policy.dueSoonDays}
            max={30}
          />
          <NumberField
            name="repeatDays"
            label="Repeat overdue reminders every (days)"
            value={data.policy.repeatDays}
            min={1}
            max={30}
          />
          <NumberField
            name="maxQueueAgeDays"
            label="Discard queued messages older than (days)"
            value={data.policy.maxQueueAgeDays}
            min={1}
            max={30}
          />
        </div>
        <CheckField name="clearKey" label="Disconnect OneSignal and remove the saved key" value={false} />
        <Action type="submit" busy={op.pending}>
          Save notification settings
        </Action>
        {op.feedback}
      </form>
      <hr />
      <Action
        secondary
        busy={manual.pending}
        onClick={() =>
          manual.run(async () => {
            const r = await triggerNotifications();
            if (r.ok)
              setResult(
                `${r.value.loans.queued} loan reminders queued; ${r.value.push.sent} notifications sent${r.value.push.configured ? "" : " · OneSignal is not connected"}.`,
              );
            return r;
          }, "Notification check completed.")
        }
      >
        Run reminders & deliver queue now
      </Action>
      {result && <p role="status">{result}</p>}
      {manual.feedback}
    </section>
  );
}
