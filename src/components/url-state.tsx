"use client";

import { BrandLoader } from "@/components/brand-loader";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, Download, Search } from "lucide-react";
import type { Page } from "@/lib/admin-types";
import { useT } from "./portal-ui";

/**
 * Page state kept in the URL (page, search, filters, tabs). Updating it asks the server for just that
 * slice of data; `pending` is true while the new page loads.
 */
export function useUrlState() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, start] = useTransition();
  const set = (updates: Record<string, string | number | null>, { resetPage = true } = {}) => {
    const next = new URLSearchParams(params.toString());
    for (const [key, value] of Object.entries(updates)) {
      if (value === null || value === "") next.delete(key); else next.set(key, String(value));
    }
    if (resetPage && !("page" in updates)) next.delete("page");
    const query = next.toString();
    start(() => router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false }));
  };
  /** Replaces all page state (e.g. when switching to a report with different filters). */
  const reset = (values: Record<string, string>) => {
    const query = new URLSearchParams(values).toString();
    start(() => router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false }));
  };
  return { params, set, reset, pending, get: (key: string) => params.get(key) ?? "" };
}

/** Search box that updates the URL after the user pauses typing. */
export function SearchBox({ value, onSearch, placeholder, label }: { value: string; onSearch: (q: string) => void; placeholder: string; label: string }) {
  const [text, setText] = useState(value);
  const latest = useRef(onSearch);
  useEffect(() => { latest.current = onSearch; });
  useEffect(() => {
    if (text.trim() === value) return;
    const id = setTimeout(() => latest.current(text.trim()), 350);
    return () => clearTimeout(id);
  }, [text, value]);
  return <label className="search-input"><Search size={17} /><input aria-label={label} placeholder={placeholder} value={text} onChange={e => setText(e.target.value)} /></label>;
}

/** Page navigation for server-paginated lists. */
export function Pager({ page, onPage, pending = false, noun }: { page: Page<unknown>; onPage: (page: number) => void; pending?: boolean; noun?: string }) {
  const t = useT();
  const pages = Math.max(1, Math.ceil(page.total / Math.max(page.pageSize, 1)));
  if (page.total === 0) return null;
  const from = (page.page - 1) * page.pageSize + 1, to = Math.min(page.total, page.page * page.pageSize);
  const near = [...new Set([1, page.page - 1, page.page, page.page + 1, pages])].filter(p => p >= 1 && p <= pages).sort((a, b) => a - b);
  return <nav className="pager" aria-label={t("Pages", "Impapuro")}>
    <span className="pager-summary">{pending && <BrandLoader size="inline" />}{from.toLocaleString("en-US")}–{to.toLocaleString("en-US")} {t("of", "kuri")} {page.total.toLocaleString("en-US")}{noun ? ` ${noun}` : ""}</span>
    {pages > 1 && <div className="pager-buttons">
      <button type="button" onClick={() => onPage(1)} disabled={page.page === 1} aria-label={t("First page", "Urupapuro rwa mbere")}><ChevronsLeft size={15} /></button>
      <button type="button" onClick={() => onPage(page.page - 1)} disabled={page.page === 1} aria-label={t("Previous page", "Urupapuro rubanza")}><ChevronLeft size={15} /></button>
      {near.map((p, i) => <span key={p} className="pager-number">{i > 0 && p - near[i - 1] > 1 && <i>…</i>}<button type="button" aria-current={p === page.page ? "page" : undefined} onClick={() => onPage(p)}>{p}</button></span>)}
      <button type="button" onClick={() => onPage(page.page + 1)} disabled={page.page === pages} aria-label={t("Next page", "Urupapuro rukurikira")}><ChevronRight size={15} /></button>
      <button type="button" onClick={() => onPage(pages)} disabled={page.page === pages} aria-label={t("Last page", "Urupapuro rwa nyuma")}><ChevronsRight size={15} /></button>
    </div>}
  </nav>;
}

/** Excel and CSV downloads of a report (see report-catalog.ts), built on the server from every matching row. */
export function ReportDownloads({ report, params }: { report: string; params: Record<string, string> }) {
  const query = new URLSearchParams(Object.entries(params).filter(([, v]) => v)).toString();
  const href = (format: string) => `/api/reports/${report}?${[query, `format=${format}`].filter(Boolean).join("&")}`;
  return <span className="download-pair"><a className="action secondary" href={href("xlsx")} download><Download size={16} />Excel</a><a className="action secondary" href={href("csv")} download>CSV</a></span>;
}

/** Client-side pages for lists already in the browser (e.g. a member's own history). */
export function useClientPages<T>(items: T[], pageSize: number) {
  const [page, setPage] = useState(1);
  const pages = Math.max(1, Math.ceil(items.length / pageSize));
  const current = Math.min(page, pages);
  return {
    rows: items.slice((current - 1) * pageSize, current * pageSize),
    page: { rows: [], total: items.length, page: current, pageSize } as Page<unknown>,
    setPage, reset: () => setPage(1),
  };
}
