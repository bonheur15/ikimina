"use client";

import { useLayoutEffect, useRef, type ComponentProps } from "react";
import { Table } from "@/components/ui/table";

/** Keep a semantic table on desktop; expose its column labels in mobile record cards. */
export function ResponsiveTable({ children, className = "", ...props }: ComponentProps<"table">) {
  const ref = useRef<HTMLTableElement>(null);
  useLayoutEffect(() => {
    const table = ref.current;
    if (!table) return;
    const labels = Array.from(table.querySelectorAll("thead th"), th => th.textContent?.trim() || "");
    table.querySelectorAll("tbody tr").forEach(row => {
      row.querySelectorAll("td").forEach((cell, index) => {
        cell.dataset.label = labels[index] || "";
        cell.dataset.action = cell.children.length === 1 && cell.firstElementChild?.classList.contains("icon-button") ? "true" : "false";
        cell.dataset.empty = cell.colSpan > 1 ? "true" : "false";
      });
    });
  }, [children]);
  return <Table ref={ref} className={`mobile-card-table ${className}`} {...props}>{children}</Table>;
}
