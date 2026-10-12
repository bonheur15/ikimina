"use client";

import { useEffect } from "react";
import { Printer } from "lucide-react";

export function PrintButton({ auto }: { auto: boolean }) {
  useEffect(() => { if (auto) setTimeout(() => window.print(), 400); }, [auto]);
  return <button type="button" className="action" onClick={() => window.print()}><Printer size={15} />Print / PDF</button>;
}
