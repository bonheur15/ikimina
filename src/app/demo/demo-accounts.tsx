"use client";

import { BrandLoader } from "@/components/brand-loader";

import { useState, useTransition } from "react";
import { ArrowRight, Check, Copy, ShieldCheck, UserRound } from "lucide-react";
import { demoSignIn } from "./actions";

type Account = {
  role: "admin" | "member" | "superadmin" | "manager";
  title: string;
  detail: string;
  identifier: string;
  altIdentifier?: string;
  password: string;
};

function CopyField({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className="demo-field"
      onClick={async () => {
        await navigator.clipboard.writeText(value);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
      title={`Copy ${label.toLowerCase()}`}
    >
      <span>
        <small>{label}</small>
        <code>{value}</code>
      </span>
      {copied ? <Check size={15} /> : <Copy size={15} />}
    </button>
  );
}

export function DemoAccounts({ accounts }: { accounts: Account[] }) {
  const [pending, start] = useTransition();
  const [active, setActive] = useState<string | null>(null);
  return (
    <div className="demo-accounts">
      {accounts.map((a) => (
        <section key={a.role} className="demo-card">
          <div className="demo-card-head">
            <span className="stat-icon blue">
              {a.role !== "member" ? <ShieldCheck size={18} /> : <UserRound size={18} />}
            </span>
            <div>
              <strong>{a.title}</strong>
              <small>{a.detail}</small>
            </div>
          </div>
          <CopyField label="Email" value={a.identifier} />
          {a.altIdentifier && <CopyField label="Or member code" value={a.altIdentifier} />}
          <CopyField label="Password" value={a.password} />
          <button
            type="button"
            className="action"
            disabled={pending}
            aria-busy={pending}
            onClick={() => {
              setActive(a.role);
              start(() => demoSignIn(a.role));
            }}
          >
            {pending && active === a.role ? <BrandLoader size="inline" /> : null}Sign in as {a.title.toLowerCase()}
            <ArrowRight size={16} />
          </button>
        </section>
      ))}
    </div>
  );
}
