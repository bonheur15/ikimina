"use client";

import { Select } from "radix-ui";
import { Check, ChevronDown, ChevronUp } from "lucide-react";

export type ChoiceOption = { value: string; label: string; group?: string };

// Radix Select doesn't allow empty values, so "" (e.g. "Uncategorized") is mapped to a placeholder value.
const EMPTY = "__empty__";
const toInner = (v: string | undefined) => v === undefined ? undefined : v === "" ? EMPTY : v;

/** Styled dropdown used instead of the browser's select. Works controlled (value/onChange) or in forms (name/defaultValue). */
export function Choice({ value, defaultValue, onChange, options, ariaLabel, name, size = "md", disabled, className = "", placeholder, required }: {
  value?: string; defaultValue?: string; onChange?: (value: string) => void; options: ChoiceOption[]; ariaLabel: string;
  name?: string; size?: "sm" | "md"; disabled?: boolean; className?: string; placeholder?: string; required?: boolean;
}) {
  const groups: { label?: string; items: ChoiceOption[] }[] = [];
  for (const option of options) {
    const last = groups.at(-1);
    if (last && last.label === option.group) last.items.push(option); else groups.push({ label: option.group, items: [option] });
  }
  const item = (o: ChoiceOption) => <Select.Item key={o.value || EMPTY} value={toInner(o.value)!} className="choice-item">
    <Select.ItemText>{o.label}</Select.ItemText><Select.ItemIndicator className="choice-check"><Check size={14} /></Select.ItemIndicator>
  </Select.Item>;
  return <Select.Root value={toInner(value)} defaultValue={toInner(defaultValue)} onValueChange={v => onChange?.(v === EMPTY ? "" : v)} name={name} disabled={disabled} required={required}>
    <Select.Trigger className={`choice choice-${size} ${className}`} aria-label={ariaLabel}>
      <span className="choice-value"><Select.Value placeholder={placeholder} /></span>
      <Select.Icon className="choice-icon"><ChevronDown size={15} /></Select.Icon>
    </Select.Trigger>
    <Select.Portal>
      <Select.Content className="choice-menu" position="popper" sideOffset={6} collisionPadding={12}>
        <Select.ScrollUpButton className="choice-scroll"><ChevronUp size={14} /></Select.ScrollUpButton>
        <Select.Viewport className="choice-viewport">
          {groups.map((g, i) => g.label
            ? <Select.Group key={`${g.label}-${i}`}><Select.Label className="choice-group">{g.label}</Select.Label>{g.items.map(item)}</Select.Group>
            : g.items.map(item))}
        </Select.Viewport>
        <Select.ScrollDownButton className="choice-scroll"><ChevronDown size={14} /></Select.ScrollDownButton>
      </Select.Content>
    </Select.Portal>
  </Select.Root>;
}
