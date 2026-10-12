"use client";

/* eslint-disable @next/next/no-html-link-for-pages -- A full document navigation lets users recover even if the app router or root layout has failed. */

import Image from "next/image";
import { ArrowRight, Home, RotateCcw } from "lucide-react";
import styles from "./error-screen.module.css";

function ErrorIllustration({ notFound }: { notFound: boolean }) {
  return (
    <svg viewBox="0 0 480 400" fill="none" aria-hidden="true" className={styles.illustration}>
      <circle cx="240" cy="195" r="164" fill="#edf3ff" />
      <circle cx="240" cy="195" r="137" stroke="#d5e2f7" strokeDasharray="4 9" />
      <ellipse cx="242" cy="338" rx="150" ry="13" fill="#dce7f7" />
      <path
        d="M88 326c43-45 72 17 113-6s63-57 104-26 55 9 82-10"
        stroke="#a9c3e9"
        strokeWidth="3"
        strokeDasharray="6 9"
        strokeLinecap="round"
      />
      <path d="M121 194v-57l119-89 119 89v57" stroke="#cbdcf5" strokeWidth="2" strokeLinejoin="round" />
      <path
        d="M145 202v108a14 14 0 0 0 14 14h162a14 14 0 0 0 14-14V202l-95-73-95 73Z"
        fill="white"
        stroke="#a5bee2"
        strokeWidth="2"
      />
      <path d="m128 210 112-86 112 86" stroke="#0057d9" strokeWidth="12" strokeLinecap="round" strokeLinejoin="round" />
      <rect x="212" y="244" width="56" height="80" rx="8" fill="#dae7fc" />
      <circle cx="255" cy="288" r="3" fill="#0057d9" />
      <rect x="169" y="229" width="26" height="30" rx="5" fill="#edf3ff" stroke="#aac5eb" strokeWidth="2" />
      <rect x="285" y="229" width="26" height="30" rx="5" fill="#edf3ff" stroke="#aac5eb" strokeWidth="2" />
      <path
        d="M115 325v-40m0 19c-24-1-31-16-30-29 20 0 31 12 30 29Zm1-14c-1-21 9-34 25-35 0 19-9 33-25 35Z"
        fill="#d8e8dd"
        stroke="#719789"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <path d="m87 110 5-12 5 12 12 5-12 5-5 12-5-12-12-5 12-5Z" fill="#f2d9a5" />
      <path d="M382 211v16m-8-8h16M153 75v12m-6-6h12" stroke="#ba9859" strokeWidth="2" strokeLinecap="round" />
      <circle cx="370" cy="95" r="5" fill="#a8c4ee" />
      <circle cx="70" cy="241" r="4" fill="#a8c4ee" />
      {notFound ? (
        <g transform="rotate(8 345 274)">
          <path d="M345 250v84" stroke="#7294c3" strokeWidth="6" strokeLinecap="round" />
          <path d="M302 242a8 8 0 0 1 8-8h65l19 20-19 20h-65a8 8 0 0 1-8-8v-24Z" fill="#0057d9" />
          <text
            x="346"
            y="261"
            fill="white"
            fontFamily="Arial, sans-serif"
            fontSize="21"
            fontWeight="700"
            textAnchor="middle"
          >
            404
          </text>
          <path d="m320 292-15 13 15 13h59a6 6 0 0 0 6-6v-14a6 6 0 0 0-6-6h-59Z" fill="#b9d1f5" />
          <path d="M338 305h25" stroke="white" strokeWidth="3" strokeLinecap="round" />
        </g>
      ) : (
        <g>
          <path
            d="M310 153h60a24 24 0 0 0 0-48h-1a34 34 0 0 0-65-10 29 29 0 0 0 6 58Z"
            fill="white"
            stroke="#96b5e1"
            strokeWidth="2"
          />
          <path
            d="m339 111-8 14h16l-8 14"
            stroke="#0057d9"
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path d="M340 170v16m0 34v21" stroke="#96b5e1" strokeWidth="3" strokeDasharray="3 6" strokeLinecap="round" />
          <path d="m333 196 14 14m0-14-14 14" stroke="#ba9859" strokeWidth="3" strokeLinecap="round" />
          <circle cx="151" cy="164" r="23" fill="#0057d9" />
          <path
            d="M160 161a10 10 0 1 0 0 9m0-9v-7m0 7h-7"
            stroke="white"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </g>
      )}
    </svg>
  );
}

export function ErrorScreen({ kind, onRetry }: { kind: "not-found" | "error"; onRetry?: () => void }) {
  const notFound = kind === "not-found";
  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <a href="/" aria-label="Elayo Family home" className={styles.brand}>
          <Image
            src="/images/elayo/logo.png"
            alt="Elayo Family"
            width={174}
            height={64}
            unoptimized
            className={styles.logo}
          />
        </a>
        <span className={styles.tagline}>Our family. Our future.</span>
      </header>
      <main className={styles.main}>
        <div className={styles.art}>
          <ErrorIllustration notFound={notFound} />
          <span className={styles.artNote}>There’s always a way home.</span>
        </div>
        <div className={styles.copy}>
          <p className={styles.eyebrow}>
            <span />
            {notFound ? "404 · PAGE NOT FOUND" : "PAGE ERROR"}
          </p>
          <h1>
            {notFound ? "Page not found" : "Something went wrong"}
            <span className={styles.dot}>.</span>
          </h1>
          <p className={styles.description}>
            {notFound
              ? "We can’t find this page. Check the link or go home."
              : "This page could not load. Try again or go home."}
          </p>
          <div className={styles.actions}>
            {!notFound && onRetry && (
              <button type="button" className={styles.primary} onClick={onRetry}>
                <RotateCcw size={17} aria-hidden="true" />
                Try again
              </button>
            )}
            <a href="/" className={notFound ? styles.primary : styles.secondary}>
              <Home size={17} aria-hidden="true" />
              Go home{notFound && <ArrowRight size={17} aria-hidden="true" />}
            </a>
          </div>
          <p className={styles.help}>
            {notFound ? "Need help? Ask your group admin." : "Still not working? Ask your group admin for help."}
          </p>
        </div>
      </main>
      <footer className={styles.footer}>
        Caisse d’entraide Elayo Family
        <span />
        Save together. Grow together.
      </footer>
    </div>
  );
}
