"use client";

import { useEffect, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { PageLoader } from "./brand-loader";

function DelayedPage({ children, delay }: { children: ReactNode; delay: number }) {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => setReady(true), delay);
    return () => window.clearTimeout(timer);
  }, [delay]);

  return ready ? children : <PageLoader fullScreen label="Loading Elayo Family…" />;
}

/** Login shows the logo for four seconds; other pages show it for two. */
export function PageLoadingDelay({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  return <DelayedPage key={pathname} delay={pathname === "/login" ? 4000 : 2000}>{children}</DelayedPage>;
}
