"use client";
import { AlertTriangle, Copy, Download, History, Send, Sparkles } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis, Cell } from "recharts";
import { LineSimple, PALETTE, AreaTrend } from "@/components/charts";
import { Badge, DataTable, ErrorState, Panel, Spinner, useToast } from "@/components/ui";
import { api, fmtDateTime, useApi } from "@/lib/client";
import type { AIAnswer, AIChart } from "@/lib/ai";

interface Boot { suggestions: string[]; providerConfigured: boolean; history: { id: string; at: string; question: string; answer: string; period: string }[] }
interface Msg { id: number; role: "user" | "ai"; text?: string; answer?: AIAnswer; error?: string }

export default function AIPage() {
  const boot = useApi<Boot>("/api/ai/chat");
  const [msgs, setMsgs] = useState<Msg[]>([]); const [q, setQ] = useState(""); const [busy, setBusy] = useState(false);
  const end = useRef<HTMLDivElement>(null); const toast = useToast();
  useEffect(() => { end.current?.scrollIntoView({ behavior: "smooth", block: "end" }); }, [msgs, busy]);

  const ask = async (text: string) => {
    const question = text.trim(); if (!question || busy) return;
    setQ(""); setBusy(true);
    setMsgs((m) => [...m, { id: Date.now(), role: "user", text: question }]);
    try {
      const r = await api<{ answer: AIAnswer }>("/api/ai/chat", { body: { question } });
      setMsgs((m) => [...m, { id: Date.now() + 1, role: "ai", answer: r.answer }]); boot.reload();
    } catch (e) { setMsgs((m) => [...m, { id: Date.now() + 1, role: "ai", error: e instanceof Error ? e.message : "The request failed" }]); }
    finally { setBusy(false); }
  };

  return (
    <div className="grid gap-5 xl:grid-cols-[1fr_320px]">
      <div className="flex min-h-[70vh] min-w-0 flex-col">
        {boot.data && !boot.data.providerConfigured && (
          <div className="mb-4 flex gap-3 rounded border border-warn/40 bg-warn/5 p-3 text-sm" role="note">
            <AlertTriangle size={18} className="mt-0.5 shrink-0 text-warn" />
            <div><b>No AI provider is connected.</b> Figures, tables and charts below are still computed from your authorised data, but the explanatory text is written by simple rules, not a language model. Set <code>AI_API_KEY</code> on the server to enable AI-written summaries (see README).</div>
          </div>
        )}
        <div className="card flex flex-1 flex-col">
          <div className="flex-1 space-y-5 overflow-y-auto p-4 sm:p-6" aria-live="polite">
            {msgs.length === 0 && (
              <div className="mx-auto max-w-xl py-8 text-center">
                <Sparkles className="mx-auto text-gold" />
                <h2 className="h-serif mt-3 text-3xl">Ask about your business</h2>
                <p className="mt-2 text-sm text-muted">Ask in plain language about sales, sell-out, customers, products or targets. Answers are built from the records you are authorised to see, state the period used, and clearly separate actual results from forecasts.</p>
              </div>
            )}
            {msgs.map((m) => m.role === "user" ? (
              <div key={m.id} className="flex justify-end"><div className="max-w-[85%] rounded-lg bg-forest px-4 py-2.5 text-sm text-white">{m.text}</div></div>
            ) : (
              <div key={m.id} className="max-w-full">{m.error ? <div className="rounded border border-bad/30 bg-bad/5 p-3 text-sm text-bad">{m.error}</div> : <Answer a={m.answer!} onFollow={ask} />}</div>
            ))}
            {busy && <div className="card inline-flex items-center gap-3 px-4 py-3"><Spinner label="Analysing authorised records..." /></div>}
            <div ref={end} />
          </div>
          <div className="border-t border-line p-3">
            <div className="mb-2 flex gap-1.5 overflow-x-auto pb-1">
              {(boot.data?.suggestions ?? []).slice(0, 8).map((s) => <button key={s} onClick={() => ask(s)} disabled={busy} className="shrink-0 rounded-full border border-line bg-white px-3 py-1 text-xs text-muted hover:border-leaf hover:text-forest disabled:opacity-50">{s}</button>)}
            </div>
            <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); ask(q); }}>
              <input className="input h-11" value={q} onChange={(e) => setQ(e.target.value)} placeholder="e.g. How did sales perform in Portugal during the last quarter?" aria-label="Ask a question" maxLength={500} />
              <button className="btn-primary h-11 px-5" disabled={busy || q.trim().length < 2} aria-label="Send"><Send size={16} /></button>
            </form>
            <button className="mt-2 text-xs text-muted hover:text-ink" onClick={() => { setMsgs([]); toast("info", "Conversation cleared"); }} disabled={!msgs.length}>Clear conversation</button>
          </div>
        </div>
      </div>
      <aside className="space-y-5">
        <Panel title="Suggested questions" bodyClass="p-2">
          <ul>{(boot.data?.suggestions ?? []).map((s) => <li key={s}><button onClick={() => ask(s)} disabled={busy} className="w-full rounded px-2 py-1.5 text-left text-sm hover:bg-cream disabled:opacity-50">{s}</button></li>)}</ul>
        </Panel>
        <Panel title="Conversation history" actions={<History size={14} className="text-muted" />} bodyClass="p-2">
          {boot.error ? <ErrorState message={boot.error} /> : (boot.data?.history.length ? (
            <ul>{boot.data.history.slice(0, 12).map((h) => <li key={h.id}><button onClick={() => ask(h.question)} disabled={busy} className="w-full rounded px-2 py-1.5 text-left hover:bg-cream"><div className="truncate text-sm">{h.question}</div><div className="text-[11px] text-muted">{fmtDateTime(h.at)} · {h.period}</div></button></li>)}</ul>
          ) : <p className="px-2 py-4 text-sm text-muted">Your previous questions appear here.</p>)}
        </Panel>
      </aside>
    </div>
  );
}

function ChartView({ c }: { c: AIChart }) {
  const colors = [PALETTE[0], PALETTE[3], PALETTE[2], PALETTE[1]];
  if (c.type === "line") return <LineSimple xKey={c.xKey} forecastFrom={c.forecastFrom} data={c.data} series={c.series.map((s, i) => ({ ...s, color: s.key === "low" || s.key === "high" ? "#CFC6B0" : colors[i % 4], dashed: s.key === "forecast" || s.key === "low" || s.key === "high" }))} />;
  if (c.type === "area") return <AreaTrend data={c.data} series={c.series.map((s, i) => ({ ...s, color: colors[i % 4] }))} />;
  const multi = c.series.length > 1;
  return (
    <div style={{ height: 250 }} role="img" aria-label={c.title}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={c.data} margin={{ top: 6, right: 8, left: 0, bottom: 28 }}>
          <CartesianGrid stroke="#E5E6DD" strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey={c.xKey} tick={{ fontSize: 10, fill: "#777B70" }} interval={0} angle={-25} textAnchor="end" height={50} axisLine={false} tickLine={false} />
          <YAxis tick={{ fontSize: 11, fill: "#777B70" }} axisLine={false} tickLine={false} width={50} />
          <Tooltip />
          {c.series.map((s, i) => <Bar isAnimationActive={false} key={s.key} dataKey={s.key} name={s.name} fill={colors[i % 4]} radius={[2, 2, 0, 0]} maxBarSize={28}>{!multi && c.data.map((d, j) => <Cell key={j} fill={Number(d[s.key]) < 0 ? "#B96C63" : colors[0]} />)}</Bar>)}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function Answer({ a, onFollow }: { a: AIAnswer; onFollow: (q: string) => void }) {
  const toast = useToast();
  const copy = async () => { try { await navigator.clipboard.writeText(`${a.title}\n${a.period.label}\n\n${a.narrative}`); toast("success", "Copied to clipboard"); } catch { toast("error", "Copy not available"); } };
  const pdf = async () => {
    const [{ jsPDF }, at] = await Promise.all([import("jspdf"), import("jspdf-autotable")]);
    const doc = new jsPDF({ unit: "pt", format: "a4" }); let y = 56;
    doc.setFont("times", "bold"); doc.setFontSize(20); doc.setTextColor(53, 74, 57); doc.text(doc.splitTextToSize(a.title, 500), 40, y); y += 30;
    doc.setFont("helvetica", "normal"); doc.setFontSize(9); doc.setTextColor(119, 123, 112); doc.text(`Period: ${a.period.label} (${a.period.from} to ${a.period.to})${a.isForecast ? " - FORECAST, NOT ACTUAL RESULTS" : ""} - Demonstration data`, 40, y); y += 22;
    doc.setFontSize(11); doc.setTextColor(41, 45, 39);
    const lines = doc.splitTextToSize(a.narrative, 515); doc.text(lines, 40, y); y += lines.length * 14 + 10;
    for (const t of a.tables.slice(0, 3)) { at.default(doc, { head: [t.headers], body: t.rows.map((r) => r.map(String)), startY: y, styles: { fontSize: 8 }, headStyles: { fillColor: [53, 74, 57] } }); y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 16; }
    doc.setFontSize(8); doc.setTextColor(119, 123, 112); doc.text(doc.splitTextToSize(`Sources: ${a.sources.join("; ")}. ${a.notes.join(" ")}`, 515), 40, Math.min(y + 8, 800));
    doc.save("ai-insight.pdf");
  };
  return (
    <div className="card p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div><h3 className="font-serif text-2xl text-forest">{a.title}</h3><p className="mt-0.5 text-xs text-muted">Period used: <b>{a.period.label}</b> ({a.period.from} to {a.period.to}){a.comparison && a.intent !== "forecast" && a.intent !== "denied" ? <> · compared with {a.comparison.from} to {a.comparison.to}</> : null}</p></div>
        <div className="flex flex-wrap gap-1.5">
          {a.isForecast ? <Badge tone="warn">Forecast — not actual results</Badge> : a.intent !== "denied" && <Badge tone="ok">Actual results</Badge>}
          <Badge tone={a.mode === "language-model" ? "info" : "neutral"}>{a.mode === "language-model" ? `Written by ${a.provider}` : "Rule-based text (no AI provider)"}</Badge>
        </div>
      </div>
      <p className="mt-4 whitespace-pre-line text-[15px] leading-relaxed">{a.narrative}</p>
      {a.metrics.length > 0 && <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">{a.metrics.map((m) => <div key={m.label} className="rounded border border-line bg-cream/50 p-3"><div className="label">{m.label}</div><div className="mt-1 font-serif text-xl text-forest">{m.value}</div>{m.delta && <div className="text-xs text-muted">{m.delta} vs comparison</div>}</div>)}</div>}
      {a.charts.map((c) => <div key={c.title} className="mt-5"><div className="mb-2 text-sm font-medium text-forest">{c.title}</div><ChartView c={c} /></div>)}
      {a.tables.map((t) => <div key={t.title} className="mt-5"><div className="mb-2 text-sm font-medium text-forest">{t.title}</div><div className="rounded border border-line"><DataTable rowKey={(r) => String(r._k)} rows={t.rows.map((r, i) => Object.fromEntries([["_k", i], ...r.map((v, j) => [`c${j}`, v])]))} cols={t.headers.map((h, j) => ({ key: `c${j}`, header: h, sortable: false, align: j > 0 && typeof t.rows[0]?.[j] === "number" ? "right" as const : undefined, render: (r: Record<string, unknown>) => typeof r[`c${j}`] === "number" ? (r[`c${j}`] as number).toLocaleString("en-GB") : String(r[`c${j}`]) }))} /></div></div>)}
      {a.notes.length > 0 && <ul className="mt-4 space-y-1 text-xs text-muted">{a.notes.map((n, i) => <li key={i}>• {n}</li>)}</ul>}
      <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-line pt-3">
        <div className="text-[11px] text-muted"><b>Sources:</b> {a.sources.join(" · ")}</div>
        <div className="flex gap-2"><button className="btn-ghost h-8 px-3 text-xs" onClick={copy}><Copy size={13} />Copy</button><button className="btn-ghost h-8 px-3 text-xs" onClick={pdf}><Download size={13} />PDF</button>
          {a.intent !== "forecast" && a.intent !== "denied" && <button className="btn-ghost h-8 px-3 text-xs" onClick={() => onFollow("Forecast sales for the next three months")}>Forecast next</button>}</div>
      </div>
    </div>
  );
}
