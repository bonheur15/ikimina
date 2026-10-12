import type { Metadata } from "next";
import { ErrorScreen } from "@/components/error-screen";

export const metadata: Metadata = { title: "Page not found — Elayo Family" };

export default function NotFound() {
  return <ErrorScreen kind="not-found" />;
}
