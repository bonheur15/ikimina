import Image from "next/image";
import type { ReactNode } from "react";

export function AuthShell({ title, subtitle, children }: { title: string; subtitle: string; children: ReactNode }) {
  return <main className="auth-page">
    <section className="auth-card">
      <Image src="/images/elayo/logo.png" alt="Elayo Family" width={3375} height={1233} unoptimized className="auth-logo" priority />
      <h1>{title}<span className="heading-dot">.</span></h1>
      <p className="auth-subtitle">{subtitle}</p>
      {children}
    </section>
    <aside className="auth-art" aria-hidden="true">
      <Image src="/images/elayo/community.jpeg" alt="" fill sizes="50vw" unoptimized />
      <div><strong>Save together. Grow together.</strong><span>Twizigame hamwe. Dutere imbere hamwe.</span></div>
    </aside>
  </main>;
}
