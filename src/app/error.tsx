"use client";

import { ErrorScreen } from "@/components/error-screen";

export default function ErrorPage({ retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return (
    <>
      <title>Something went wrong — Elayo Family</title>
      <ErrorScreen kind="error" onRetry={retry} />
    </>
  );
}
