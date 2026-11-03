"use client";
import { CheckCircle2, Download, FileUp, Loader2, Upload, XCircle } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { api, download, downloadTemplate, type Filters } from "@/lib/client";
import { useApp } from "./app-context";
import { Badge, Modal, useToast } from "./ui";

export function ExportButton({ dataset, filters }: { dataset: "sales" | "sellout"; filters: Filters }) {
  const { can } = useApp(); const toast = useToast();
  const [open, setOpen] = useState(false); const [busy, setBusy] = useState(false); const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { const h = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); }; document.addEventListener("mousedown", h); return () => document.removeEventListener("mousedown", h); }, []);
  if (!can(`${dataset}:export`)) return null;
  const go = async (f: "xlsx" | "csv" | "pdf") => { setBusy(true); setOpen(false); try { await download(dataset, f, filters); toast("success", `Exported ${f.toUpperCase()}`); } catch (e) { toast("error", e instanceof Error ? e.message : "Export failed"); } finally { setBusy(false); } };
  return (
    <div ref={ref} className="relative">
      <button className="btn-ghost" onClick={() => setOpen(!open)} disabled={busy} aria-haspopup="menu" aria-expanded={open}>{busy ? <Loader2 size={15} className="animate-spin" /> : <Download size={15} />}Export</button>
      {open && <div className="card absolute right-0 top-10 z-30 w-44 p-1" role="menu">{(["xlsx", "csv", "pdf"] as const).map((f) => <button key={f} role="menuitem" className="block w-full rounded px-3 py-2 text-left text-sm hover:bg-cream" onClick={() => go(f)}>{{ xlsx: "Excel (.xlsx)", csv: "CSV (.csv)", pdf: "PDF (.pdf)" }[f]}</button>)}</div>}
    </div>
  );
}

interface Result { total: number; valid: number; imported: number; dryRun: boolean; issues: { row: number; field: string; message: string }[] }

export function ImportModal({ kind, open, onClose, onDone }: { kind: "sales" | "sellout"; open: boolean; onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const [file, setFile] = useState<File | null>(null); const [res, setRes] = useState<Result | null>(null); const [busy, setBusy] = useState(false); const [err, setErr] = useState<string | null>(null);
  useEffect(() => { if (!open) { setFile(null); setRes(null); setErr(null); } }, [open]);
  const send = async (dryRun: boolean) => {
    if (!file) return; setBusy(true); setErr(null);
    const form = new FormData(); form.set("kind", kind); form.set("file", file); form.set("dryRun", String(dryRun));
    try {
      const r = await api<Result>("/api/import", { form }); setRes(r);
      if (!dryRun) { toast(r.issues.length ? "info" : "success", `Imported ${r.imported} of ${r.total} rows`); onDone(); if (!r.issues.length) onClose(); }
    } catch (e) { setErr(e instanceof Error ? e.message : "Import failed"); } finally { setBusy(false); }
  };
  const canImport = res && res.valid > 0;
  return (
    <Modal open={open} onClose={onClose} title={`Import ${kind === "sales" ? "sales" : "sell-out"} data`} wide
      footer={<><button className="btn-ghost" onClick={onClose}>Close</button><button className="btn-ghost" disabled={!file || busy} onClick={() => send(true)}>{busy && <Loader2 size={14} className="animate-spin" />}Validate file</button><button className="btn-primary" disabled={!canImport || busy || !res?.dryRun} onClick={() => send(false)}>Import {canImport ? `${res!.valid} valid rows` : ""}</button></>}>
      <div className="space-y-4">
        <p className="text-sm text-muted">Upload a CSV or Excel file. Every file is validated first: missing values, duplicates, unknown product codes, unsupported currencies, inconsistent reporting periods and customers outside your access are reported per row. Only valid rows are imported.</p>
        <div className="flex flex-wrap gap-2 text-sm">
          <span className="text-muted">Templates:</span>
          {(["csv", "xlsx"] as const).map((f) => <button key={f} className="text-leaf hover:underline" onClick={() => downloadTemplate(`${kind}-template.${f}`).catch(() => toast("error", "Template unavailable"))}>{kind} template (.{f})</button>)}
        </div>
        <label className="flex cursor-pointer flex-col items-center gap-2 rounded border border-dashed border-sage bg-cream/50 px-4 py-8 text-center hover:bg-cream">
          <FileUp className="text-leaf" /><span className="text-sm">{file ? file.name : "Choose a .csv or .xlsx file (max 8 MB)"}</span>
          <input type="file" accept=".csv,.xlsx,.xls" className="sr-only" onChange={(e) => { setFile(e.target.files?.[0] ?? null); setRes(null); setErr(null); }} />
        </label>
        {err && <div role="alert" className="rounded border border-bad/30 bg-bad/5 p-3 text-sm text-bad">{err}</div>}
        {res && (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone="info">{res.total} rows</Badge><Badge tone="ok"><CheckCircle2 size={11} className="mr-1" />{res.valid} valid</Badge>
              <Badge tone={res.issues.length ? "bad" : "neutral"}><XCircle size={11} className="mr-1" />{res.issues.length} issues</Badge>
              {!res.dryRun && <Badge tone="gold"><Upload size={11} className="mr-1" />{res.imported} imported</Badge>}
            </div>
            {res.issues.length > 0 && (
              <div className="max-h-56 overflow-auto rounded border border-line">
                <table className="w-full text-xs"><thead><tr><th className="th">Row</th><th className="th">Field</th><th className="th">Problem</th></tr></thead>
                  <tbody>{res.issues.map((i, n) => <tr key={n}><td className="td">{i.row || "-"}</td><td className="td">{i.field}</td><td className="td whitespace-normal">{i.message}</td></tr>)}</tbody></table>
              </div>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
}
