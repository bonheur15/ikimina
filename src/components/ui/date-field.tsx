"use client";

import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { Popover } from "radix-ui";
import { CalendarDays, CalendarRange, ChevronDown, ChevronLeft, ChevronRight, Clock } from "lucide-react";
import { kigaliTime, kigaliToday } from "@/lib/portal-data";
import { useT } from "../portal-ui";

// Date, month and time pickers that replace the browser's default inputs. Each renders a hidden input
// with the usual value format (YYYY-MM-DD, YYYY-MM, HH:MM) so they work inside ordinary forms.

const pad = (n: number) => String(n).padStart(2, "0");
const iso = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(d)}`;
const parts = (value: string) => value.split("-").map(Number);
const addDays = (value: string, days: number) => { const [y, m, d] = parts(value); const date = new Date(Date.UTC(y, m - 1, d + days)); return iso(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate()); };
const shiftMonth = (ym: string, months: number) => { const [y, m] = parts(ym); const date = new Date(Date.UTC(y, m - 1 + months, 1)); return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}`; };

function useControlled(value: string | undefined, defaultValue: string | undefined, onChange?: (v: string) => void) {
  const [inner, setInner] = useState(defaultValue ?? "");
  const current = value ?? inner;
  return [current, (next: string) => { setInner(next); onChange?.(next); }] as const;
}

function useLocale() {
  const t = useT();
  const locale = t("en-GB", "rw-RW");
  const fmt = (options: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat(locale, { timeZone: "UTC", ...options });
  return {
    t,
    monthName: (ym: string, style: "long" | "short" = "long") => fmt({ month: style }).format(new Date(`${ym}-15T12:00:00Z`)),
    monthYear: (ym: string) => fmt({ month: "long", year: "numeric" }).format(new Date(`${ym}-15T12:00:00Z`)),
    fullDate: (value: string) => fmt({ weekday: "short", day: "numeric", month: "short", year: "numeric" }).format(new Date(`${value}T12:00:00Z`)),
    weekdays: Array.from({ length: 7 }, (_, i) => fmt({ weekday: "short" }).format(new Date(Date.UTC(2024, 0, 1 + i)))),
  };
}

/** Grid of 12 months for one year. */
function MonthGrid({ year, selected, min, max, onYear, onPick }: { year: number; selected: string; min?: string; max?: string; onYear: (year: number) => void; onPick: (ym: string) => void }) {
  const { t, monthName } = useLocale();
  const current = kigaliToday().slice(0, 7);
  return <div className="cal">
    <div className="cal-head"><button type="button" className="cal-nav" onClick={() => onYear(year - 1)} aria-label={t("Previous year", "Umwaka ubanza")}><ChevronLeft size={16} /></button><strong>{year}</strong><button type="button" className="cal-nav" onClick={() => onYear(year + 1)} aria-label={t("Next year", "Umwaka ukurikira")}><ChevronRight size={16} /></button></div>
    <div className="cal-months">{Array.from({ length: 12 }, (_, i) => {
      const ym = `${year}-${pad(i + 1)}`;
      const off = (min && ym < min.slice(0, 7)) || (max && ym > max.slice(0, 7));
      return <button key={ym} type="button" disabled={!!off} aria-pressed={ym === selected} className={ym === current ? "is-today" : undefined} onClick={() => onPick(ym)}>{monthName(ym, "short")}</button>;
    })}</div>
  </div>;
}

/** Day calendar with month navigation, a month/year view and keyboard support. */
function Calendar({ value, min, max, onPick }: { value: string; min?: string; max?: string; onPick: (date: string) => void }) {
  const { t, monthYear, weekdays } = useLocale();
  const today = kigaliToday();
  const [cursor, setCursor] = useState((value || today).slice(0, 7));
  const [focus, setFocus] = useState(value || today);
  const [view, setView] = useState<"days" | "months">("days");
  const gridRef = useRef<HTMLDivElement>(null);
  const [y, m] = parts(cursor);
  const offset = (new Date(Date.UTC(y, m - 1, 1)).getUTCDay() + 6) % 7;
  const start = addDays(iso(y, m, 1), -offset);
  const days = Array.from({ length: 42 }, (_, i) => addDays(start, i));
  const disabled = (d: string) => (!!min && d < min) || (!!max && d > max);

  useEffect(() => { gridRef.current?.querySelector<HTMLButtonElement>(`[data-date="${focus}"]`)?.focus(); }, [focus, cursor]);
  const moveFocus = (next: string) => { setFocus(next); if (next.slice(0, 7) !== cursor) setCursor(next.slice(0, 7)); };
  const onKeyDown = (event: KeyboardEvent) => {
    const steps: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 };
    if (steps[event.key]) { event.preventDefault(); moveFocus(addDays(focus, steps[event.key])); }
    else if (event.key === "PageUp" || event.key === "PageDown") { event.preventDefault(); const ym = shiftMonth(focus.slice(0, 7), event.key === "PageUp" ? -1 : 1); moveFocus(`${ym}-${pad(Math.min(parts(focus)[2], 28))}`); }
  };

  if (view === "months") return <MonthGrid year={y} selected={cursor} min={min} max={max} onYear={year => setCursor(`${year}-${pad(m)}`)} onPick={ym => { setCursor(ym); setView("days"); }} />;
  return <div className="cal">
    <div className="cal-head">
      <button type="button" className="cal-nav" onClick={() => setCursor(shiftMonth(cursor, -1))} aria-label={t("Previous month", "Ukwezi kubanza")}><ChevronLeft size={16} /></button>
      <button type="button" className="cal-title" onClick={() => setView("months")} aria-label={t("Choose month and year", "Hitamo ukwezi n’umwaka")}>{monthYear(cursor)}<ChevronDown size={14} /></button>
      <button type="button" className="cal-nav" onClick={() => setCursor(shiftMonth(cursor, 1))} aria-label={t("Next month", "Ukwezi gukurikira")}><ChevronRight size={16} /></button>
    </div>
    <div className="cal-weekdays">{weekdays.map(w => <span key={w}>{w.slice(0, 2)}</span>)}</div>
    <div className="cal-days" ref={gridRef} role="grid" onKeyDown={onKeyDown}>{days.map(d => <button key={d} type="button" data-date={d} tabIndex={d === focus ? 0 : -1}
      disabled={disabled(d)} aria-pressed={d === value} aria-label={d}
      className={[d.slice(0, 7) !== cursor && "is-outside", d === today && "is-today"].filter(Boolean).join(" ") || undefined}
      onClick={() => onPick(d)}>{parts(d)[2]}</button>)}</div>
    <div className="cal-foot"><button type="button" disabled={disabled(today)} onClick={() => onPick(today)}>{t("Today", "Uyu munsi")}</button></div>
  </div>;
}

export function DateField({ name, value, defaultValue, onChange, min, max, ariaLabel, required, placeholder }: {
  name?: string; value?: string; defaultValue?: string; onChange?: (value: string) => void; min?: string; max?: string;
  ariaLabel: string; required?: boolean; placeholder?: string;
}) {
  const [current, set] = useControlled(value, defaultValue, onChange);
  const [open, setOpen] = useState(false);
  const { fullDate, t } = useLocale();
  return <Popover.Root open={open} onOpenChange={setOpen}>
    <Popover.Trigger asChild><button type="button" className="picker-trigger" aria-label={ariaLabel}><CalendarDays size={16} /><span className={current ? undefined : "is-empty"}>{current ? fullDate(current) : placeholder ?? t("Choose a date", "Hitamo itariki")}</span><ChevronDown size={15} className="picker-chevron" /></button></Popover.Trigger>
    {name && <input type="hidden" name={name} value={current} required={required} />}
    <Popover.Portal><Popover.Content className="picker-pop" sideOffset={6} align="start" collisionPadding={12}>
      <Calendar value={current} min={min} max={max} onPick={d => { set(d); setOpen(false); }} />
    </Popover.Content></Popover.Portal>
  </Popover.Root>;
}

export function MonthField({ name, value, defaultValue, onChange, min, max, ariaLabel }: {
  name?: string; value?: string; defaultValue?: string; onChange?: (value: string) => void; min?: string; max?: string; ariaLabel: string;
}) {
  const [current, set] = useControlled(value, defaultValue, onChange);
  const [open, setOpen] = useState(false);
  const [year, setYear] = useState(parts(current || kigaliToday())[0]);
  const { monthYear, t } = useLocale();
  return <Popover.Root open={open} onOpenChange={next => { setOpen(next); if (next) setYear(parts(current || kigaliToday())[0]); }}>
    <Popover.Trigger asChild><button type="button" className="picker-trigger" aria-label={ariaLabel}><CalendarRange size={16} /><span className={current ? undefined : "is-empty"}>{current ? monthYear(current) : t("Choose a month", "Hitamo ukwezi")}</span><ChevronDown size={15} className="picker-chevron" /></button></Popover.Trigger>
    {name && <input type="hidden" name={name} value={current} />}
    <Popover.Portal><Popover.Content className="picker-pop" sideOffset={6} align="start" collisionPadding={12}>
      <MonthGrid year={year} selected={current} min={min} max={max} onYear={setYear} onPick={ym => { set(ym); setOpen(false); }} />
    </Popover.Content></Popover.Portal>
  </Popover.Root>;
}

export function TimeField({ name, value, defaultValue, onChange, ariaLabel }: {
  name?: string; value?: string; defaultValue?: string; onChange?: (value: string) => void; ariaLabel: string;
}) {
  const [current, set] = useControlled(value, defaultValue ?? kigaliTime(), onChange);
  const [open, setOpen] = useState(false);
  const { t } = useLocale();
  const [hour, minute] = (current || "00:00").split(":");
  const columnRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const id = requestAnimationFrame(() => columnRef.current?.parentElement?.querySelectorAll<HTMLElement>("[aria-pressed=true]").forEach(el => el.scrollIntoView({ block: "center" })));
    return () => cancelAnimationFrame(id);
  }, [open]);
  return <Popover.Root open={open} onOpenChange={setOpen}>
    <Popover.Trigger asChild><button type="button" className="picker-trigger" aria-label={ariaLabel}><Clock size={16} /><span>{current}</span><ChevronDown size={15} className="picker-chevron" /></button></Popover.Trigger>
    {name && <input type="hidden" name={name} value={current} />}
    <Popover.Portal><Popover.Content className="picker-pop time-pop" sideOffset={6} align="start" collisionPadding={12}>
      <div className="time-cols">
        <div ref={columnRef} aria-label={t("Hour", "Isaha")}>{Array.from({ length: 24 }, (_, h) => pad(h)).map(h => <button key={h} type="button" aria-pressed={h === hour} onClick={() => set(`${h}:${minute}`)}>{h}</button>)}</div>
        <div aria-label={t("Minute", "Umunota")}>{Array.from({ length: 60 }, (_, mm) => pad(mm)).map(mm => <button key={mm} type="button" aria-pressed={mm === minute} onClick={() => { set(`${hour}:${mm}`); setOpen(false); }}>{mm}</button>)}</div>
      </div>
      <div className="cal-foot"><button type="button" onClick={() => { set(kigaliTime()); setOpen(false); }}>{t("Now", "Ubu")}</button></div>
    </Popover.Content></Popover.Portal>
  </Popover.Root>;
}
