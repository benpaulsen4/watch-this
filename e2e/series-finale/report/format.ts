// Small text helpers shared by the HTML and Markdown renderers.
import type { Evidence } from "../support/evidence";

export function esc(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export function json(value: unknown): string {
  return JSON.stringify(value) ?? "undefined";
}

export function clip(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

export function seconds(ms: number): string {
  return `${(ms / 1000).toFixed(1)} s`;
}

export function specOf(e: Evidence): string {
  return e.spec ?? "(spec not recorded)";
}

export function groupBy<T>(items: T[], key: (item: T) => string): Map<string, T[]> {
  const out = new Map<string, T[]>();
  for (const item of items) {
    const k = key(item);
    out.set(k, [...(out.get(k) ?? []), item]);
  }
  return out;
}

/** An evidence line's result in words: PASS/FAIL for a check, met/not met for a note. */
export function resultLabel(e: Evidence): string {
  if (!e.informational) return e.pass ? "PASS" : "FAIL";
  return e.pass ? "note met" : "note not met";
}
