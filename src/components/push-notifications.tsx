"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { Bell } from "lucide-react";
import { Action, useT } from "./portal-ui";

type SDK = {
  init: (options: Record<string, unknown>) => Promise<void>;
  login: (id: string) => Promise<void>;
  logout: () => Promise<void>;
  Notifications: { permission: boolean; isPushSupported: () => boolean; requestPermission: () => Promise<void> };
  User: { PushSubscription: { optedIn: boolean; optIn: () => Promise<void> } };
};
declare global {
  interface Window {
    OneSignalDeferred?: Array<(sdk: SDK) => void>;
  }
}
let sdkPromise: Promise<SDK> | null = null;
function sdkFor(appId: string) {
  if (!sdkPromise)
    sdkPromise = new Promise<SDK>((resolve, reject) => {
      window.OneSignalDeferred = window.OneSignalDeferred || [];
      window.OneSignalDeferred.push(async (sdk) => {
        try {
          await sdk.init({
            appId,
            serviceWorkerPath: "onesignal/OneSignalSDKWorker.js",
            serviceWorkerParam: { scope: "/onesignal/" },
            allowLocalhostAsSecureOrigin: true,
            welcomeNotification: { disable: true },
            notifyButton: { enable: false },
            promptOptions: { slidedown: { prompts: [{ type: "push", autoPrompt: false }] } },
          });
          resolve(sdk);
        } catch (error) {
          reject(error);
        }
      });
      const script = document.createElement("script");
      script.src = "https://cdn.onesignal.com/sdks/web/v16/OneSignalSDK.page.js";
      script.defer = true;
      script.onerror = () => reject(new Error("Push SDK could not be loaded."));
      document.head.append(script);
    });
  return sdkPromise;
}
async function syncPush() {
  const response = await fetch("/api/push/config", { cache: "no-store" });
  const config = (await response.json()) as { configured: boolean; appId?: string; externalId?: string | null };
  if (!config.configured || !config.appId) return null;
  const sdk = await sdkFor(config.appId);
  if (config.externalId) await sdk.login(config.externalId);
  else await sdk.logout();
  return sdk;
}
export function PushIdentitySync() {
  const pathname = usePathname();
  useEffect(() => {
    void syncPush().catch(() => undefined);
  }, [pathname]);
  return null;
}
export function PushNotificationButton() {
  const t = useT();
  const [sdk, setSDK] = useState<SDK | null>(null),
    [enabled, setEnabled] = useState(false),
    [pending, setPending] = useState(false),
    [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    syncPush()
      .then((s) => {
        if (active && s?.Notifications.isPushSupported()) {
          setSDK(s);
          setEnabled(s.Notifications.permission && s.User.PushSubscription.optedIn);
        }
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, []);
  if (!sdk) return null;
  return (
    <div className="push-permission">
      <Action
        secondary
        disabled={enabled}
        busy={pending}
        onClick={async () => {
          setPending(true);
          setError("");
          try {
            await sdk.Notifications.requestPermission();
            if (sdk.Notifications.permission) await sdk.User.PushSubscription.optIn();
            setEnabled(sdk.Notifications.permission && sdk.User.PushSubscription.optedIn);
            if (!sdk.Notifications.permission)
              setError(
                t(
                  "Allow notifications in your browser settings to receive reminders.",
                  "Emera imenyesha muri browser kugira ngo ubone amakuru.",
                ),
              );
          } catch {
            setError(
              t("Notifications could not be enabled. Please try again.", "Imenyesha ntiryakunze. Ongera ugerageze."),
            );
          } finally {
            setPending(false);
          }
        }}
      >
        <Bell size={16} />
        {enabled
          ? t("Notifications enabled", "Imenyesha ryemewe")
          : t("Enable savings notifications", "Emera imenyesha ry’ubwizigame")}
      </Action>
      {error && (
        <p role="status" className="muted">
          {error}
        </p>
      )}
    </div>
  );
}
