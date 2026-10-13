"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { ArrowDownToLine, Share, X } from "lucide-react";
import Image from "next/image";
import { usePathname } from "next/navigation";
import type { Translate } from "./portal-ui";

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

// Chromium fires `beforeinstallprompt` once, often before the sidebar mounts, so it is kept here.
let deferredPrompt: InstallPromptEvent | null = null;
let installed = false;
const DISMISS_KEY = "elayo-install-dismissed-until";
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((listener) => listener());
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    deferredPrompt = event as InstallPromptEvent;
    notify();
  });
  window.addEventListener("appinstalled", () => {
    installed = true;
    deferredPrompt = null;
    notify();
  });
  window.addEventListener("storage", notify);
}

/** Registers the service worker that makes the app installable (production builds only). */
export function ServiceWorkerRegistration() {
  const pathname = usePathname();
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" }).catch(() => undefined);
  }, []);
  // Dashboards supply their own translator; the invitation is also available before sign-in.
  return pathname.startsWith("/admin") || pathname.startsWith("/member") ? null : <InstallAppPrompt t={(en) => en} />;
}

const isStandalone = () =>
  window.matchMedia("(display-mode: standalone)").matches ||
  (navigator as Navigator & { standalone?: boolean }).standalone === true;
const isIos = () =>
  /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
const isAndroid = () => /android/i.test(navigator.userAgent);
const canInstall = () => !installed && !isStandalone();
const isSnoozed = () => {
  try {
    return Number(localStorage.getItem(DISMISS_KEY)) > Date.now();
  } catch {
    return false;
  }
};
const snoozeInstall = () => {
  try {
    localStorage.setItem(DISMISS_KEY, String(Date.now() + 7 * 24 * 60 * 60 * 1000));
  } catch {
    /* Storage is optional. */
  }
  notify();
};

async function requestInstall(prompt: InstallPromptEvent) {
  // Each browser event can only be used once. Claim it before awaiting.
  if (deferredPrompt !== prompt) return;
  deferredPrompt = null;
  notify();
  try {
    await prompt.prompt();
    const choice = await prompt.userChoice;
    if (choice.outcome === "accepted") installed = true;
    else snoozeInstall();
  } finally {
    notify();
  }
}

/** Android invitation appears on arrival, with native installation or browser instructions. */
export function InstallAppPrompt({ t }: { t: Translate }) {
  const prompt = useSyncExternalStore(
    subscribe,
    () => deferredPrompt,
    () => null,
  );
  const eligible = useSyncExternalStore(
    subscribe,
    () => isAndroid() && canInstall() && !isSnoozed(),
    () => false,
  );
  const [dismissed, setDismissed] = useState(false);
  const [guidance, setGuidance] = useState(false);
  if (!eligible || dismissed) return null;
  return (
    <section className="pwa-install-prompt" aria-label={t("Install Elayo Family", "Shyiraho Elayo Family")}>
      <Image className="pwa-install-icon" src="/icons/icon-192.png" width={48} height={48} alt="" />
      <div className="pwa-install-copy">
        <strong>{t("Use the Elayo Family app", "Koresha porogaramu ya Elayo Family")}</strong>
        <p>{t("Your savings, right on your home screen.", "Ubwizigame bwawe kuri telefoni yawe.")}</p>
      </div>
      <button
        className="action pwa-install-action"
        aria-expanded={guidance}
        onClick={() => {
          if (prompt) void requestInstall(prompt).catch(() => setGuidance(true));
          else setGuidance(true);
        }}
      >
        <ArrowDownToLine size={17} />
        {t("Install app now", "Shyiraho porogaramu ubu")}
      </button>
      {guidance && (
        <p className="pwa-install-guidance" role="status">
          {t(
            "In Chrome, tap the ⋮ menu, then “Install app” or “Add to Home screen”. Using a link inside another app? Open it in Chrome first.",
            "Muri Chrome, kanda menu ⋮, uhitemo “Install app” cyangwa “Add to Home screen”. Niba uri mu yindi porogaramu, banza ufungure uru rubuga muri Chrome.",
          )}
        </p>
      )}
      <button
        className="icon-button"
        onClick={() => {
          setDismissed(true);
          snoozeInstall();
        }}
        aria-label={t("Not now", "Si ubu")}
      >
        <X size={18} />
      </button>
    </section>
  );
}

/** "Install app" in the sidebar: the browser prompt where supported, Add to Home Screen steps on iPhone and iPad. */
export function InstallAppButton({ t }: { t: Translate }) {
  const prompt = useSyncExternalStore(
    subscribe,
    () => deferredPrompt,
    () => null,
  );
  const ios = useSyncExternalStore(
    subscribe,
    () => isIos() && !isStandalone(),
    () => false,
  );
  const android = useSyncExternalStore(
    subscribe,
    () => isAndroid() && canInstall(),
    () => false,
  );
  const available = useSyncExternalStore(subscribe, canInstall, () => false);
  const [hint, setHint] = useState(false);

  if (!available || (!prompt && !ios && !android)) return null;
  if (!prompt)
    return (
      <>
        <button className="sidebar-help" onClick={() => setHint((shown) => !shown)} aria-expanded={hint}>
          <ArrowDownToLine size={18} />
          {t("Install app", "Shyiraho porogaramu")}
        </button>
        {hint && (
          <p className="install-hint">
            {ios ? (
              <>
                {t("Tap", "Kanda")} <Share size={13} aria-label={t("Share", "Sangiza")} />{" "}
                {t("in Safari, then “Add to Home Screen”.", "muri Safari, hanyuma uhitemo “Add to Home Screen”.")}
              </>
            ) : (
              t(
                "Open this page in Chrome, tap the ⋮ menu, then “Install app” or “Add to Home screen”.",
                "Fungura uru rubuga muri Chrome, kanda menu ⋮, uhitemo “Install app” cyangwa “Add to Home screen”.",
              )
            )}
          </p>
        )}
      </>
    );
  return (
    <button
      className="sidebar-help"
      onClick={async () => {
        try {
          await requestInstall(prompt);
        } catch {
          setHint(true);
        }
      }}
    >
      <ArrowDownToLine size={18} />
      {t("Install app", "Shyiraho porogaramu")}
    </button>
  );
}
