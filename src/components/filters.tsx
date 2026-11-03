"use client";
import { Bookmark, BookmarkPlus, RotateCcw, SlidersHorizontal, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { shiftIso } from "@/lib/dates";
import type { Filters } from "@/lib/client";
import { useApp } from "./app-context";
import { MultiSelect, useToast } from "./ui";

type Preset = { name: string; filters: Filters };
const KEY = (id: string) => `phyto.presets.${id}`;

export function FilterBar({ show = ["countries", "customers", "products", "brands", "reps", "channels", "categories"], compareToggle = false }: { show?: string[]; compareToggle?: boolean }) {
  const { filters, setFilters, patchFilters, resetFilters, meta, me, compare, setCompare } = useApp();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [presets, setPresets] = useState<Preset[]>([]);
  const [menu, setMenu] = useState(false);
  useEffect(() => { try { setPresets(JSON.parse(localStorage.getItem(KEY(me.user.id)) ?? "[]")); } catch { setPresets([]); } }, [me.user.id]);
  const persist = (p: Preset[]) => { setPresets(p); try { localStorage.setItem(KEY(me.user.id), JSON.stringify(p)); } catch { toast("error", "Could not save presets in this browser"); } };

  const lm = meta.latestMonth; const end = meta.defaultRange.to;
  const quick: { label: string; from: string; to: string }[] = [
    { label: "This month", from: `${lm}-01`, to: end },
    { label: "Last quarter", ...quarter(lm, -1) },
    { label: "YTD", from: meta.defaultRange.from, to: end },
    { label: "Last 12 months", from: `${shiftIso(`${lm}-01`, -11)}`, to: end },
    { label: "Last year", from: `${+lm.slice(0, 4) - 1}-01-01`, to: `${+lm.slice(0, 4) - 1}-12-31` },
  ];
  const count = ["countries", "customers", "products", "brands", "reps", "channels", "categories"].reduce((n, k) => n + ((filters as Record<string, string[] | undefined>)[k]?.length ? 1 : 0), 0);
  const sel = (k: keyof Filters, label: string, options: { value: string; label: string }[]) => show.includes(k) && options.length > 0 && (
    <MultiSelect key={k} label={label} options={options} value={(filters[k] as string[]) ?? []} onChange={(v) => patchFilters({ [k]: v.length ? v : undefined })} />
  );
  return (
    <div className="card mb-5 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1.5">
          <input type="date" aria-label="From date" className="input w-[9.5rem]" value={filters.from ?? ""} max={filters.to} onChange={(e) => patchFilters({ from: e.target.value || undefined })} />
          <span className="text-muted">-</span>
          <input type="date" aria-label="To date" className="input w-[9.5rem]" value={filters.to ?? ""} min={filters.from} onChange={(e) => patchFilters({ to: e.target.value || undefined })} />
        </div>
        <div className="hidden flex-wrap gap-1 lg:flex">
          {quick.map((q) => {
            const on = filters.from === q.from && filters.to === q.to;
            return <button key={q.label} onClick={() => patchFilters({ from: q.from, to: q.to })} className={`rounded-full border px-3 py-1 text-xs ${on ? "border-forest bg-forest text-white" : "border-line text-muted hover:bg-cream"}`}>{q.label}</button>;
          })}
        </div>
        {compareToggle && (
          <div className="flex overflow-hidden rounded border border-line text-xs" role="group" aria-label="Comparison period">
            {([["yoy", "vs last year"], ["prev", "vs previous period"]] as const).map(([v, l]) => (
              <button key={v} onClick={() => setCompare(v)} aria-pressed={compare === v} className={`px-3 py-2 ${compare === v ? "bg-cream font-medium text-forest" : "text-muted hover:bg-cream/60"}`}>{l}</button>
            ))}
          </div>
        )}
        <div className="ml-auto flex items-center gap-2">
          <button className="btn-ghost h-9 lg:hidden" onClick={() => setOpen(!open)} aria-expanded={open}><SlidersHorizontal size={15} />Filters{count ? ` (${count})` : ""}</button>
          <div className="relative">
            <button className="btn-ghost" onClick={() => setMenu(!menu)} aria-haspopup="menu" aria-expanded={menu}><Bookmark size={15} /><span className="hidden sm:inline">Saved views</span></button>
            {menu && (
              <div className="card absolute right-0 top-10 z-30 w-72 p-2" role="menu">
                <button className="flex w-full items-center gap-2 rounded px-2 py-2 text-left text-sm hover:bg-cream" onClick={() => {
                  const name = window.prompt("Name this filter combination");
                  if (name?.trim()) { persist([...presets.filter((p) => p.name !== name.trim()), { name: name.trim(), filters }]); toast("success", `Saved view "${name.trim()}"`); }
                  setMenu(false);
                }}><BookmarkPlus size={15} />Save current filters</button>
                <div className="my-1 border-t border-line" />
                {presets.length === 0 && <div className="px-2 py-3 text-xs text-muted">No saved views yet.</div>}
                {presets.map((p) => (
                  <div key={p.name} className="flex items-center gap-1">
                    <button className="flex-1 truncate rounded px-2 py-1.5 text-left text-sm hover:bg-cream" onClick={() => { setFilters(p.filters); setMenu(false); toast("info", `Applied "${p.name}"`); }}>{p.name}</button>
                    <button aria-label={`Delete ${p.name}`} className="rounded p-1.5 text-muted hover:bg-cream hover:text-bad" onClick={() => persist(presets.filter((x) => x.name !== p.name))}><Trash2 size={14} /></button>
                  </div>
                ))}
              </div>
            )}
          </div>
          <button className="btn-ghost" onClick={() => { resetFilters(); toast("info", "Filters reset"); }}><RotateCcw size={15} /><span className="hidden sm:inline">Reset</span></button>
        </div>
      </div>
      <div className={`${open ? "grid" : "hidden"} mt-3 grid-cols-1 gap-2 sm:grid-cols-2 lg:grid lg:grid-cols-4 xl:grid-cols-7`}>
        {sel("countries", "Country", meta.countries)}{sel("customers", "Customer", meta.customers)}{sel("products", "Product", meta.products)}
        {sel("brands", "Brand", meta.brands)}{sel("reps", "Sales rep", meta.reps)}{sel("channels", "Channel", meta.channels)}{sel("categories", "Category", meta.categories)}
      </div>
    </div>
  );
}

function quarter(lm: string, offset: number) {
  const y = +lm.slice(0, 4), q = Math.floor((+lm.slice(5) - 1) / 3) + offset;
  const yy = y + Math.floor(q / 4), qq = ((q % 4) + 4) % 4;
  const m1 = qq * 3 + 1, m3 = m1 + 2;
  return { from: `${yy}-${String(m1).padStart(2, "0")}-01`, to: `${yy}-${String(m3).padStart(2, "0")}-${String(new Date(yy, m3, 0).getDate()).padStart(2, "0")}` };
}
