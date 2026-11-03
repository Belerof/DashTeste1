"use client";
import clsx from "clsx";
import { AlertTriangle, Check, CheckCircle2, ChevronDown, Info, Inbox, Loader2, X, XCircle } from "lucide-react";
import { createContext, useCallback, useContext, useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import { Area, AreaChart, ResponsiveContainer } from "recharts";

/* ---------- toasts ---------- */
type Toast = { id: number; kind: "success" | "error" | "info"; text: string };
const ToastCtx = createContext<(kind: Toast["kind"], text: string) => void>(() => {});
export const useToast = () => useContext(ToastCtx);
export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<Toast[]>([]);
  const push = useCallback((kind: Toast["kind"], text: string) => {
    const id = Date.now() + Math.random(); setItems((x) => [...x, { id, kind, text }]);
    setTimeout(() => setItems((x) => x.filter((t) => t.id !== id)), kind === "error" ? 7000 : 4000);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="fixed bottom-4 right-4 z-[100] flex w-[calc(100vw-2rem)] max-w-sm flex-col gap-2" role="status" aria-live="polite">
        {items.map((t) => (
          <div key={t.id} className="card flex items-start gap-3 px-4 py-3 text-sm animate-[fadein_.2s_ease]">
            {t.kind === "success" ? <CheckCircle2 size={18} className="mt-0.5 shrink-0 text-ok" /> : t.kind === "error" ? <XCircle size={18} className="mt-0.5 shrink-0 text-bad" /> : <Info size={18} className="mt-0.5 shrink-0 text-leaf" />}
            <span className="flex-1">{t.text}</span>
            <button onClick={() => setItems((x) => x.filter((i) => i.id !== t.id))} aria-label="Dismiss" className="text-muted hover:text-ink"><X size={14} /></button>
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

/* ---------- modal / confirm ---------- */
export function Modal({ open, onClose, title, children, wide = false, footer }: { open: boolean; onClose: () => void; title: string; children: ReactNode; wide?: boolean; footer?: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const tid = useId();
  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey); ref.current?.focus();
    return () => { document.removeEventListener("keydown", onKey); prev?.focus(); };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/40 p-0 sm:items-center sm:p-4" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={ref} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby={tid} className={clsx("card flex max-h-[92vh] w-full flex-col rounded-b-none outline-none sm:rounded-b-md", wide ? "sm:max-w-3xl" : "sm:max-w-lg")}>
        <div className="flex items-center justify-between border-b border-line px-5 py-4">
          <h2 id={tid} className="h-serif text-xl">{title}</h2>
          <button onClick={onClose} aria-label="Close" className="rounded p-1 text-muted hover:bg-cream hover:text-ink"><X size={18} /></button>
        </div>
        <div className="overflow-y-auto px-5 py-4">{children}</div>
        {footer && <div className="flex justify-end gap-2 border-t border-line px-5 py-3">{footer}</div>}
      </div>
    </div>
  );
}
export function Confirm({ open, title, body, confirmLabel = "Confirm", danger, busy, onConfirm, onClose }: { open: boolean; title: string; body: ReactNode; confirmLabel?: string; danger?: boolean; busy?: boolean; onConfirm: () => void; onClose: () => void }) {
  return (
    <Modal open={open} onClose={onClose} title={title} footer={<><button className="btn-ghost" onClick={onClose}>Cancel</button><button className={danger ? "btn-danger" : "btn-primary"} onClick={onConfirm} disabled={busy}>{busy && <Loader2 size={14} className="animate-spin" />}{confirmLabel}</button></>}>
      <div className="text-sm text-ink/80">{body}</div>
    </Modal>
  );
}

/* ---------- small pieces ---------- */
export function Badge({ children, tone = "neutral" }: { children: ReactNode; tone?: "neutral" | "ok" | "warn" | "bad" | "info" | "gold" }) {
  const t = { neutral: "bg-cream text-muted border-line", ok: "bg-ok/10 text-ok border-ok/30", warn: "bg-warn/10 text-warn border-warn/30", bad: "bg-bad/10 text-bad border-bad/30", info: "bg-leaf/10 text-leaf border-leaf/30", gold: "bg-gold/10 text-[#8a7747] border-gold/40" }[tone];
  return <span className={clsx("inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium", t)}>{children}</span>;
}
export function DemoBadge() { return <Badge tone="gold">Demonstration data</Badge>; }
export function Skeleton({ className = "" }: { className?: string }) { return <div className={clsx("animate-pulse rounded bg-beige/70", className)} />; }
export function Empty({ title, hint, icon }: { title: string; hint?: string; icon?: ReactNode }) {
  return <div className="flex flex-col items-center justify-center gap-2 px-4 py-12 text-center text-muted">{icon ?? <Inbox size={28} className="text-sage" />}<div className="font-serif text-lg text-forest">{title}</div>{hint && <div className="max-w-sm text-sm">{hint}</div>}</div>;
}
export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return <div className="flex flex-col items-center gap-3 px-4 py-10 text-center"><AlertTriangle className="text-bad" /><div className="text-sm text-ink/80">{message}</div>{onRetry && <button className="btn-ghost" onClick={onRetry}>Try again</button>}</div>;
}
export function Spinner({ label = "Loading" }: { label?: string }) { return <div className="flex items-center gap-2 text-sm text-muted" role="status"><Loader2 size={16} className="animate-spin" />{label}</div>; }

export function Panel({ title, subtitle, actions, children, className = "", bodyClass = "p-4" }: { title?: ReactNode; subtitle?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string; bodyClass?: string }) {
  return (
    <section className={clsx("card", className)}>
      {(title || actions) && (
        <header className="flex flex-wrap items-start justify-between gap-2 border-b border-line/70 px-4 py-3">
          <div><h3 className="font-serif text-[17px] leading-tight text-forest">{title}</h3>{subtitle && <p className="mt-0.5 text-xs text-muted">{subtitle}</p>}</div>
          {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
        </header>
      )}
      <div className={bodyClass}>{children}</div>
    </section>
  );
}

export function Tabs<T extends string>({ value, onChange, items }: { value: T; onChange: (v: T) => void; items: { id: T; label: string }[] }) {
  return (
    <div role="tablist" className="flex gap-1 overflow-x-auto border-b border-line">
      {items.map((i) => (
        <button key={i.id} role="tab" aria-selected={value === i.id} onClick={() => onChange(i.id)}
          className={clsx("-mb-px whitespace-nowrap border-b-2 px-4 py-2.5 text-sm transition-colors", value === i.id ? "border-forest font-medium text-forest" : "border-transparent text-muted hover:text-ink")}>{i.label}</button>
      ))}
    </div>
  );
}

export function Progress({ value, tone }: { value: number; tone?: "ok" | "warn" | "bad" }) {
  const t = tone ?? (value >= 100 ? "ok" : value >= 85 ? "warn" : "bad");
  return <div className="h-1.5 w-full overflow-hidden rounded-full bg-beige" role="progressbar" aria-valuenow={Math.round(value)} aria-valuemin={0} aria-valuemax={100}><div className={clsx("h-full rounded-full transition-all", t === "ok" ? "bg-ok" : t === "warn" ? "bg-warn" : "bg-bad")} style={{ width: `${Math.min(100, Math.max(0, value))}%` }} /></div>;
}

export function Spark({ data, positive = true }: { data: number[]; positive?: boolean }) {
  const d = data.map((v, i) => ({ i, v }));
  const c = positive ? "#687A58" : "#B96C63"; const id = useId().replace(/:/g, "");
  return (
    <div className="h-9 w-24" aria-hidden>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={d} margin={{ top: 2, bottom: 2, left: 0, right: 0 }}>
          <defs><linearGradient id={id} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={c} stopOpacity=".28" /><stop offset="1" stopColor={c} stopOpacity="0" /></linearGradient></defs>
          <Area type="monotone" dataKey="v" stroke={c} strokeWidth={1.5} fill={`url(#${id})`} isAnimationActive={false} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

export function Delta({ value, invert = false }: { value: number | null; invert?: boolean }) {
  if (value == null) return <span className="text-xs text-muted">n/a</span>;
  const good = invert ? value < 0 : value >= 0;
  return <span className={clsx("inline-flex items-center gap-0.5 text-xs font-medium", good ? "text-ok" : "text-bad")}>{value >= 0 ? "▲" : "▼"} {Math.abs(value).toLocaleString("en-GB", { maximumFractionDigits: 1 })}%</span>;
}

/* ---------- multi select ---------- */
export function MultiSelect({ label, options, value, onChange, searchable = true }: { label: string; options: { value: string; label: string }[]; value: string[]; onChange: (v: string[]) => void; searchable?: boolean }) {
  const [open, setOpen] = useState(false); const [q, setQ] = useState(""); const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { const h = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); }; document.addEventListener("mousedown", h); return () => document.removeEventListener("mousedown", h); }, []);
  const shown = useMemo(() => options.filter((o) => o.label.toLowerCase().includes(q.toLowerCase())), [options, q]);
  const text = value.length === 0 ? "All" : value.length === 1 ? options.find((o) => o.value === value[0])?.label ?? "1 selected" : `${value.length} selected`;
  return (
    <div ref={ref} className="relative min-w-0">
      <button type="button" aria-haspopup="listbox" aria-expanded={open} onClick={() => setOpen(!open)}
        className={clsx("flex h-9 w-full items-center justify-between gap-2 rounded border bg-white px-3 text-left text-sm", value.length ? "border-leaf" : "border-line", "hover:border-sage")}>
        <span className="min-w-0 truncate"><span className="text-muted">{label}: </span>{text}</span><ChevronDown size={14} className="shrink-0 text-muted" />
      </button>
      {open && (
        <div className="card absolute left-0 top-10 z-30 w-64 max-w-[85vw] p-2 shadow-lg">
          {searchable && options.length > 6 && <input autoFocus className="input mb-2" placeholder={`Search ${label.toLowerCase()}...`} value={q} onChange={(e) => setQ(e.target.value)} />}
          <ul role="listbox" aria-multiselectable className="max-h-56 overflow-y-auto">
            {shown.map((o) => {
              const on = value.includes(o.value);
              return (
                <li key={o.value} role="option" aria-selected={on}>
                  <button type="button" className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-cream" onClick={() => onChange(on ? value.filter((v) => v !== o.value) : [...value, o.value])}>
                    <span className={clsx("flex h-4 w-4 shrink-0 items-center justify-center rounded-sm border", on ? "border-forest bg-forest text-white" : "border-line")}>{on && <Check size={11} />}</span><span className="truncate">{o.label}</span>
                  </button>
                </li>
              );
            })}
            {shown.length === 0 && <li className="px-2 py-3 text-sm text-muted">No matches</li>}
          </ul>
          {value.length > 0 && <button className="mt-2 w-full rounded border border-line py-1 text-xs text-muted hover:bg-cream" onClick={() => onChange([])}>Clear</button>}
        </div>
      )}
    </div>
  );
}

/* ---------- data table ---------- */
export interface Col<T> { key: string; header: string; render?: (r: T) => ReactNode; align?: "right"; sortable?: boolean; hideBelow?: "md" | "lg" }
export function DataTable<T extends Record<string, unknown>>({ cols, rows, sort, dir, onSort, onRow, empty = "No records match your filters", loading, rowKey }: {
  cols: Col<T>[]; rows: T[]; sort?: string; dir?: "asc" | "desc"; onSort?: (k: string) => void; onRow?: (r: T) => void; empty?: string; loading?: boolean; rowKey: (r: T) => string;
}) {
  return (
    <div className="relative overflow-x-auto">
      <table className="w-full min-w-max border-collapse">
        <thead>
          <tr>
            {cols.map((c) => (
              <th key={c.key} scope="col" aria-sort={sort === c.key ? (dir === "asc" ? "ascending" : "descending") : undefined}
                className={clsx("th", c.align === "right" && "text-right", c.hideBelow === "md" && "hidden md:table-cell", c.hideBelow === "lg" && "hidden lg:table-cell")}>
                {c.sortable !== false && onSort ? (
                  <button className="inline-flex items-center gap-1 uppercase tracking-[.1em] hover:text-ink" onClick={() => onSort(c.key)}>{c.header}<span className="text-[9px]">{sort === c.key ? (dir === "asc" ? "▲" : "▼") : ""}</span></button>
                ) : c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className={clsx(loading && "opacity-50")}>
          {rows.map((r) => (
            <tr key={rowKey(r)} className={clsx("transition-colors", onRow && "cursor-pointer hover:bg-cream/70")} onClick={() => onRow?.(r)} tabIndex={onRow ? 0 : undefined} onKeyDown={(e) => onRow && e.key === "Enter" && onRow(r)}>
              {cols.map((c) => (
                <td key={c.key} className={clsx("td", c.align === "right" && "text-right tabular-nums", c.hideBelow === "md" && "hidden md:table-cell", c.hideBelow === "lg" && "hidden lg:table-cell")}>{c.render ? c.render(r) : String(r[c.key] ?? "")}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {!loading && rows.length === 0 && <Empty title={empty} />}
    </div>
  );
}
export function Pager({ page, size, total, onPage }: { page: number; size: number; total: number; onPage: (p: number) => void }) {
  const pages = Math.max(1, Math.ceil(total / size));
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line px-4 py-2.5 text-xs text-muted">
      <span>{total === 0 ? "0 records" : `${(page - 1) * size + 1}-${Math.min(total, page * size)} of ${total.toLocaleString("en-GB")}`}</span>
      <div className="flex items-center gap-1">
        <button className="btn-ghost h-8 px-3" disabled={page <= 1} onClick={() => onPage(page - 1)}>Previous</button>
        <span className="px-2">Page {page} / {pages}</span>
        <button className="btn-ghost h-8 px-3" disabled={page >= pages} onClick={() => onPage(page + 1)}>Next</button>
      </div>
    </div>
  );
}

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return <label className="block"><span className="label mb-1 block">{label}</span>{children}{hint && <span className="mt-1 block text-xs text-muted">{hint}</span>}</label>;
}
