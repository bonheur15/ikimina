import Image from "next/image";
import type { ReactNode } from "react";

export function AuthShell({
  title,
  subtitle,
  children,
  variant = "default",
}: {
  title: string;
  subtitle: string;
  children: ReactNode;
  variant?: "default" | "community";
}) {
  const isCommunity = variant === "community";
  return (
    <main className={`auth-page${isCommunity ? " auth-page-community" : ""}`}>
      <section className="auth-card">
        <Image
          src="/images/elayo/logo.png"
          alt="Elayo Family"
          width={3375}
          height={1233}
          unoptimized
          className="auth-logo"
          preload
        />
        <h1>
          {title}
          <span className="heading-dot">.</span>
        </h1>
        <p className="auth-subtitle">{subtitle}</p>
        {children}
        {isCommunity && <p className="auth-signature">Caisse d’entraide Elayo Family</p>}
      </section>
      {isCommunity ? (
        <aside className="auth-community" aria-label="Our Elayo Family community">
          <div className="auth-community-inner">
            <p className="auth-community-eyebrow">OUR FAMILY. OUR FUTURE.</p>
            <div className="auth-photo-composition">
              <span className="auth-photo-orbit" aria-hidden="true" />
              <svg className="auth-sparkle" viewBox="0 0 64 72" fill="none" aria-hidden="true">
                <path
                  d="M29 4c0 22-6 28-23 30 17 2 23 8 23 30 2-22 8-28 25-30C37 32 31 26 29 4Z"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinejoin="round"
                />
                <path d="m52 4 1 10m-6-5 11-1" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
              </svg>
              <figure className="auth-community-photo">
                <Image
                  src="/images/elayo/community.jpeg"
                  alt="Elayo Family members celebrating together around an anniversary cake"
                  width={1280}
                  height={854}
                  sizes="(max-width: 860px) 90vw, 46vw"
                  unoptimized
                  loading="eager"
                />
              </figure>
              <span className="auth-photo-note">
                Better, together.
                <svg viewBox="0 0 28 26" fill="none" aria-hidden="true">
                  <path
                    d="M14 23S2 16 2 8a6 6 0 0 1 12-1 6 6 0 0 1 12 1c0 8-12 15-12 15Z"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </span>
              <svg className="auth-sprout" viewBox="0 0 100 128" fill="none" aria-hidden="true">
                <path d="M48 120c7-39 4-70 20-102" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
                <path
                  d="M56 85C26 85 12 64 14 46c24 0 41 15 42 39Z"
                  fill="#d8e6f7"
                  stroke="currentColor"
                  strokeWidth="2"
                />
                <path
                  d="M57 64c-3-27 10-47 32-51 1 25-10 45-32 51Z"
                  fill="#e5edfb"
                  stroke="currentColor"
                  strokeWidth="2"
                />
                <path
                  d="m27 60 28 24m20-54L58 62M39 120h26"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                />
              </svg>
            </div>
            <div className="auth-community-copy">
              <h2>
                Save together.
                <br />
                <span>
                  Grow together
                  <svg viewBox="0 0 290 15" fill="none" preserveAspectRatio="none" aria-hidden="true">
                    <path
                      d="M3 10C77 1 188 1 286 7M42 13c83-6 157-5 215-3"
                      stroke="currentColor"
                      strokeWidth="3"
                      strokeLinecap="round"
                    />
                  </svg>
                </span>
                .
              </h2>
              <p>Twizigame hamwe. Dutere imbere hamwe.</p>
            </div>
            <p className="auth-community-footer">
              <span />A little saved. A future shared.
              <span />
            </p>
          </div>
        </aside>
      ) : (
        <aside className="auth-art" aria-hidden="true">
          <Image src="/images/elayo/community.jpeg" alt="" fill sizes="50vw" unoptimized />
          <div>
            <strong>Save together. Grow together.</strong>
            <span>Twizigame hamwe. Dutere imbere hamwe.</span>
          </div>
        </aside>
      )}
    </main>
  );
}
