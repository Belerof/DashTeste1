"use client";
import { useCallback, useEffect, useRef, useState } from "react";

export class ApiError extends Error { constructor(public status: number, message: string, public body?: unknown) { super(message); } }

export async function api<T = unknown>(url: string, opts: { method?: string; body?: unknown; form?: FormData } = {}): Promise<T> {
  const res = await fetch(url, {
    method: opts.method ?? (opts.body || opts.form ? "POST" : "GET"),
    headers: opts.body ? { "Content-Type": "application/json" } : undefined,
    body: opts.form ?? (opts.body ? JSON.stringify(opts.body) : undefined),
    credentials: "same-origin",
  });
  if (res.status === 401) { window.location.href = `/login?next=${encodeURIComponent(location.pathname)}`; throw new ApiError(401, "Session expired"); }
  const ct = res.headers.get("content-type") ?? "";
  const data = ct.includes("json") ? await res.json() : null;
  if (!res.ok) throw new ApiError(res.status, data?.error ?? res.statusText, data);
  return data as T;
}

/** Fetches JSON whenever `key` changes; exposes loading/error/reload. */
export function useApi<T>(url: string | null, opts?: { method?: string; body?: unknown }) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(!!url);
  const seq = useRef(0);
  const bodyKey = opts?.body ? JSON.stringify(opts.body) : "";
  const load = useCallback(async () => {
    if (!url) return;
    const id = ++seq.current; setLoading(true); setError(null);
    try { const d = await api<T>(url, opts?.body ? { method: opts.method ?? "POST", body: opts.body } : {}); if (id === seq.current) setData(d); }
    catch (e) { if (id === seq.current) setError(e instanceof Error ? e.message : "Request failed"); }
    finally { if (id === seq.current) setLoading(false); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url, bodyKey]);
  useEffect(() => { load(); }, [load]);
  return { data, error, loading, reload: load, setData };
}

export async function download(dataset: string, format: string, filters: unknown, report?: string) {
  const res = await fetch("/api/export", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ dataset, report, format, filters }) });
  if (!res.ok) { const j = await res.json().catch(() => ({})); throw new ApiError(res.status, j.error ?? "Export failed"); }
  const blob = await res.blob();
  const name = /filename="([^"]+)"/.exec(res.headers.get("content-disposition") ?? "")?.[1] ?? `export.${format}`;
  const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
export async function downloadTemplate(name: string) {
  const res = await fetch(`/api/templates/${name}`);
  if (!res.ok) throw new ApiError(res.status, "Template unavailable");
  const blob = await res.blob(); const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); a.remove();
}

export const fmtEUR = (n: number | null | undefined, compact = false) => n == null ? "-" : compact && Math.abs(n) >= 1000
  ? `${(n / (Math.abs(n) >= 1e6 ? 1e6 : 1e3)).toLocaleString("en-GB", { maximumFractionDigits: 1 })}${Math.abs(n) >= 1e6 ? "M" : "k"}` : n.toLocaleString("en-GB", { maximumFractionDigits: 0 });
export const fmtNum = (n: number | null | undefined) => (n == null ? "-" : n.toLocaleString("en-GB", { maximumFractionDigits: 0 }));
export const fmtPct = (n: number | null | undefined) => (n == null ? "n/a" : `${n > 0 ? "+" : ""}${n.toLocaleString("en-GB", { maximumFractionDigits: 1 })}%`);
export const fmtDate = (d: string | null) => (d ? new Date(d).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) : "-");
export const fmtDateTime = (d: string | null) => (d ? new Date(d).toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : "Never");
const MN = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export const fmtMonth = (m: string) => `${MN[+m.slice(5) - 1]} ${m.slice(2, 4)}`;

export interface Filters { from?: string; to?: string; countries?: string[]; customers?: string[]; products?: string[]; brands?: string[]; reps?: string[]; channels?: string[]; categories?: string[] }
export interface Opt { value: string; label: string; country?: string; brand?: string }
export interface Meta { countries: Opt[]; customers: Opt[]; products: Opt[]; brands: Opt[]; reps: Opt[]; channels: Opt[]; categories: Opt[]; defaultRange: { from: string; to: string }; latestMonth: string; sources: string[] }
export interface Me {
  user: { id: string; name: string; email: string; role?: string; roleId: string; country: string; department: string; jobTitle: string; avatar?: string; lastLogin: string | null; language: string; status: string };
  permissions: string[]; settings: Record<string, string>; unread: number; demoData: boolean; demoAuth: boolean;
}
