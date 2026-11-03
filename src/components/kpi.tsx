"use client";
import clsx from "clsx";
import { fmtEUR, fmtNum } from "@/lib/client";
import { Delta, Spark } from "./ui";

export interface Kpi { id: string; label: string; value: number; prev: number | null; delta: number | null; unit: string; spark: number[]; target?: number | null; note?: string }

export function kpiValue(k: Kpi) {
  if (k.unit === "EUR") return `€${fmtEUR(k.value, Math.abs(k.value) >= 1e6)}`;
  if (k.unit === "%") return `${k.value.toLocaleString("en-GB", { maximumFractionDigits: 1 })}%`;
  return fmtNum(k.value);
}
export function kpiPrev(k: Kpi) {
  if (k.prev == null) return k.id === "target" && k.target ? `Target €${fmtEUR(k.target, true)}` : k.note ? "No target at this level" : "";
  return k.unit === "EUR" ? `€${fmtEUR(k.prev, Math.abs(k.prev) >= 1e6)}` : fmtNum(k.prev);
}

export function KpiCard({ k, onClick, label2 }: { k: Kpi; onClick?: () => void; label2?: string }) {
  const positive = k.id === "target" ? k.value >= 100 : (k.delta ?? k.value) >= 0;
  return (
    <button onClick={onClick} className={clsx("card group flex w-full flex-col justify-between gap-3 p-4 text-left transition-shadow hover:shadow-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-leaf", !onClick && "cursor-default")} aria-label={`${k.label}: ${kpiValue(k)}. Open detailed analysis`}>
      <div className="flex items-start justify-between gap-2"><span className="label">{k.label}</span><span className="text-[10px] text-muted">{k.unit === "EUR" ? "EUR" : k.unit === "units" ? "units" : ""}</span></div>
      <div className="flex items-end justify-between gap-2">
        <div className="min-w-0">
          <div className="font-serif text-[30px] leading-none text-forest tabular-nums">{kpiValue(k)}</div>
          <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted">
            {k.id === "growth" ? <Delta value={k.value} /> : k.id === "target" ? <span className={k.value >= 100 ? "text-ok" : "text-warn"}>{k.target ? (k.value >= 100 ? "On target" : "Below target") : "n/a"}</span> : <Delta value={k.delta} />}
            <span>{label2 ?? (k.id === "growth" ? "vs previous month" : kpiPrev(k) ? (k.id === "target" ? kpiPrev(k) : `vs ${kpiPrev(k)}`) : "")}</span>
          </div>
        </div>
        <Spark data={k.spark.length > 1 ? k.spark : [0, 0]} positive={positive} />
      </div>
    </button>
  );
}
