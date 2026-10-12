"use client";

import { ErrorScreen } from "@/components/error-screen";

export default function GlobalError({ retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return (
    <html lang="en">
      <body style={{ margin: 0 }}>
        <title>Something went wrong — Elayo Family</title>
        <ErrorScreen kind="error" onRetry={retry} />
      </body>
    </html>
  );
}
