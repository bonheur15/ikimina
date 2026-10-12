"use client";

import { canEditRecords } from "@/lib/permissions";
import { usePortal } from "./account-dashboard";
import { useState, useTransition } from "react";
import { Ban, Check, Copy, KeyRound, Link2, Pencil, ShieldCheck } from "lucide-react";
import { createSignInLink, setAccountDisabled, updateMember } from "@/app/actions/portal";
import { money, principalOf, type Member } from "@/lib/portal-data";
import { Action, SectionHeading, useT } from "./portal-ui";
import { Choice } from "./ui/choice";

/** Profile, contact details and sign-in account for one member, as seen by an administrator. */
export function MemberAdminPanel({ member, onChanged }: { member: Member; onChanged: () => void }) {
  const t = useT();
  const editable = canEditRecords(usePortal().viewer.role);
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState("");
  const [link, setLink] = useState<{ url: string; expiresAt: string; reset: boolean } | null>(null);
  const [copied, setCopied] = useState(false);
  const [pending, start] = useTransition();
  const [first, ...rest] = member.name.split(" ");

  const makeLink = () =>
    start(async () => {
      setError("");
      const result = await createSignInLink(member.id);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setLink(result);
      setCopied(false);
      onChanged();
    });
  const copy = async () => {
    if (!link) return;
    await navigator.clipboard.writeText(link.url);
    setCopied(true);
  };
  const toggleAccess = (disabled: boolean) =>
    start(async () => {
      const result = await setAccountDisabled(member.id, disabled);
      if (!result.ok) setError(result.error);
      else onChanged();
    });

  return (
    <div className="member-admin">
      <dl className="detail-list">
        <div>
          <dt>{t("Status", "Uko ahagaze")}</dt>
          <dd>
            {member.status === "active"
              ? t("Current member", "Umunyamuryango")
              : t("Former member", "Yahoze ari umunyamuryango")}
          </dd>
        </div>
        <div>
          <dt>{t("Email", "Imeyili")}</dt>
          <dd>{member.email || <span className="muted">{t("Not collected", "Ntiyakusanyijwe")}</span>}</dd>
        </div>
        <div>
          <dt>{t("Phone", "Telefoni")}</dt>
          <dd>{member.phone || "—"}</dd>
        </div>
        <div>
          <dt>{t("Savings principal", "Ubwizigame shingiro")}</dt>
          <dd>{money(principalOf(member))} RWF</dd>
        </div>
        <div>
          <dt>{t("Monthly savings", "Ubwizigame bwa buri kwezi")}</dt>
          <dd>{member.monthlySavings ? `${money(member.monthlySavings)} RWF` : t("Not set", "Ntibirashyirwaho")}</dd>
        </div>
      </dl>
      {editable && !editing && (
        <button className="text-action" onClick={() => setEditing(true)}>
          <Pencil size={14} />
          {t("Edit details", "Hindura amakuru")}
        </button>
      )}
      {editing && (
        <form
          className="portal-form member-edit"
          onSubmit={(event) => {
            event.preventDefault();
            const form = new FormData(event.currentTarget);
            const commitment = String(form.get("monthlyCommitment") ?? "").trim();
            start(async () => {
              const result = await updateMember({
                code: member.id,
                surname: String(form.get("surname")),
                firstName: String(form.get("firstName")),
                email: String(form.get("email")),
                phone: String(form.get("phone")),
                district: String(form.get("district")),
                monthlyCommitment: commitment ? Number(commitment) : null,
                status: String(form.get("status")) as "active",
              });
              if (!result.ok) {
                setError(result.error);
                return;
              }
              setEditing(false);
              setError("");
              onChanged();
            });
          }}
        >
          <div className="form-grid">
            <label className="field">
              {t("First name", "Izina")}
              <input name="firstName" defaultValue={first} maxLength={80} />
            </label>
            <label className="field">
              {t("Surname", "Irindi zina")}
              <input name="surname" defaultValue={rest.join(" ")} maxLength={80} required />
            </label>
          </div>
          <div className="form-grid">
            <label className="field">
              {t("Email", "Imeyili")}
              <input name="email" type="email" defaultValue={member.email} maxLength={200} />
            </label>
            <label className="field">
              {t("Phone", "Telefoni")}
              <input name="phone" type="tel" defaultValue={member.phone} maxLength={60} />
            </label>
          </div>
          <div className="form-grid">
            <label className="field">
              {t("District", "Akarere")}
              <input name="district" defaultValue={member.district} maxLength={60} />
            </label>
            <label className="field">
              {t("Monthly savings (RWF)", "Ubwizigame bwa buri kwezi (RWF)")}
              <input
                name="monthlyCommitment"
                type="number"
                min="0"
                step="1000"
                defaultValue={member.monthlySavings || ""}
              />
            </label>
          </div>
          <div className="field">
            {t("Status", "Uko ahagaze")}
            <Choice
              name="status"
              defaultValue={member.status}
              ariaLabel={t("Status", "Uko ahagaze")}
              options={[
                { value: "active", label: t("Current member", "Umunyamuryango") },
                { value: "former", label: t("Former member", "Yahoze ari umunyamuryango") },
              ]}
            />
          </div>
          <div className="record-success-actions">
            <Action
              secondary
              onClick={() => {
                setEditing(false);
                setError("");
              }}
            >
              {t("Cancel", "Reka")}
            </Action>
            <Action type="submit" busy={pending}>
              <Check size={15} />
              {t("Save details", "Bika amakuru")}
            </Action>
          </div>
        </form>
      )}

      {editable && (
        <section className="account-box">
          <SectionHeading
            title={t("Sign-in account", "Konti yo kwinjira")}
            subtitle={
              member.account === "blocked"
                ? t("Sign-in is blocked for this member.", "Uyu munyamuryango yahagaritswe kwinjira.")
                : member.account === "active"
                  ? t("This member can sign in.", "Uyu munyamuryango ashobora kwinjira.")
                  : member.account === "invited"
                    ? t(
                        "A sign-in link was created but no password has been chosen yet.",
                        "Hakozwe ihuza ariko ijambo ry’ibanga ntiriratoranywa.",
                      )
                    : t(
                        "No account yet. Create a link and share it with the member.",
                        "Nta konti irahari. Kora ihuza urisangize umunyamuryango.",
                      )
            }
          />
          {link ? (
            <div className="link-box">
              <input
                readOnly
                value={link.url}
                aria-label={t("Sign-in link", "Ihuza ryo kwinjira")}
                onFocus={(e) => e.currentTarget.select()}
              />
              <Action secondary onClick={copy}>
                {copied ? <Check size={15} /> : <Copy size={15} />}
                {copied ? t("Copied", "Byakoporowe") : t("Copy", "Koporora")}
              </Action>
              <p className="muted">
                {t("Works once, until", "Rikora rimwe, kugeza")}{" "}
                {new Date(link.expiresAt).toLocaleDateString("en-GB", {
                  day: "numeric",
                  month: "short",
                  year: "numeric",
                })}
                .{" "}
                {t(
                  "Share it privately, e.g. by WhatsApp or email.",
                  "Risangize mu ibanga, nko kuri WhatsApp cyangwa imeyili.",
                )}
              </p>
            </div>
          ) : (
            <Action secondary onClick={makeLink} busy={pending}>
              {member.account === "active" ? <KeyRound size={15} /> : <Link2 size={15} />}
              {member.account === "active"
                ? t("Create password reset link", "Kora ihuza ryo guhindura ijambo ry’ibanga")
                : t("Create sign-in link", "Kora ihuza ryo kwinjira")}
            </Action>
          )}
          {member.account !== "none" && (
            <div className="account-access">
              {member.account === "blocked" ? (
                <button className="text-action" onClick={() => toggleAccess(false)} disabled={pending}>
                  <ShieldCheck size={14} />
                  {t("Allow sign-in again", "Emera kongera kwinjira")}
                </button>
              ) : (
                <button className="text-action danger-text" onClick={() => toggleAccess(true)} disabled={pending}>
                  <Ban size={14} />
                  {t("Block sign-in", "Hagarika kwinjira")}
                </button>
              )}
            </div>
          )}
        </section>
      )}
      {error && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}
    </div>
  );
}
