"use client";
import { Download, FileSpreadsheet, FileText, Loader2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { download, type Filters } from "@/lib/client";
import { useApp } from "./app-context";
import { useToast } from "./ui";

const ALL = [
  { key: "monthly_sales", label: "Monthly sales report", mod: "sales" },
  { key: "annual_sales", label: "Annual sales report", mod: "sales" },
  { key: "country_performance", label: "Country performance", mod: "sales" },
  { key: "customer_performance", label: "Customer performance", mod: "sales" },
  { key: "product_performance", label: "Product performance", mod: "sales" },
  { key: "sales_vs_target", label: "Sales versus target", mod: "sales" },
  { key: "sellout", label: "Sell-out report", mod: "sellout" },
  { key: "sellin_vs_sellout", label: "Sell-in versus sell-out", mod: "sellout" },
];

/** Reports dropdown shared by Dashboard, Sales and Sell-Out. Server re-checks every permission. */
export function ReportsMenu({ filters, only }: { filters: Filters; only?: ("sales" | "sellout")[] }) {
  const { can } = useApp(); const toast = useToast();
  const [open, setOpen] = useState(false); const [busy, setBusy] = useState<string | null>(null); const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { const h = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); }; document.addEventListener("mousedown", h); return () => document.removeEventListener("mousedown", h); }, []);
  if (!can("reports:export") && !can("reports:view")) return null;
  const items = ALL.filter((r) => can(`${r.mod}:view`) && (!only || only.includes(r.mod as "sales")));
  const run = async (key: string, fmt: "xlsx" | "csv" | "pdf") => {
    setBusy(key + fmt);
    try { await download("report", fmt, filters, key); toast("success", "Report downloaded"); } catch (e) { toast("error", e instanceof Error ? e.message : "Export failed"); } finally { setBusy(null); }
  };
  return (
    <div ref={ref} className="relative">
      <button className="btn-ghost" onClick={() => setOpen(!open)} aria-haspopup="menu" aria-expanded={open} disabled={!can("reports:export")} title={can("reports:export") ? "" : "You do not have permission to export reports"}><Download size={15} />Reports</button>
      {open && (
        <div className="card absolute right-0 top-10 z-30 w-[22rem] max-w-[90vw] p-2" role="menu">
          <div className="label px-2 py-1.5">Respects your access permissions</div>
          {items.map((r) => (
            <div key={r.key} className="flex items-center justify-between gap-2 rounded px-2 py-1.5 hover:bg-cream">
              <span className="text-sm">{r.label}</span>
              <span className="flex gap-1">
                {([["xlsx", FileSpreadsheet], ["csv", FileText], ["pdf", FileText]] as const).map(([f, Icon]) => (
                  <button key={f} className="flex items-center gap-1 rounded border border-line bg-white px-1.5 py-1 text-[10px] uppercase text-muted hover:border-leaf hover:text-forest" onClick={() => run(r.key, f)} disabled={!!busy} aria-label={`${r.label} as ${f}`}>
                    {busy === r.key + f ? <Loader2 size={11} className="animate-spin" /> : <Icon size={11} />}{f}
                  </button>
                ))}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
