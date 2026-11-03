"use client";
import { Bar, BarChart, CartesianGrid, Cell, ComposedChart, Legend, Line, LineChart, Pie, PieChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis, Area, AreaChart } from "recharts";
import { fmtEUR, fmtMonth } from "@/lib/client";

export const PALETTE = ["#354A39", "#687A58", "#AAB49C", "#B5A17B", "#CFC6B0", "#8c6f5a", "#B96C63", "#5f7f86"];
const axis = { fontSize: 11, fill: "#777B70" };
const grid = <CartesianGrid stroke="#E5E6DD" strokeDasharray="3 3" vertical={false} />;

function Tip({ active, payload, label, money = true, labelFmt }: { active?: boolean; payload?: { name: string; value: number; color: string }[]; label?: string; money?: boolean; labelFmt?: (l: string) => string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="card px-3 py-2 text-xs shadow-md">
      <div className="mb-1 font-medium text-forest">{labelFmt ? labelFmt(String(label)) : label}</div>
      {payload.filter((p) => p.value != null).map((p) => (
        <div key={p.name} className="flex items-center gap-2"><span className="h-2 w-2 rounded-full" style={{ background: p.color }} />{p.name}: <b>{money ? `EUR ${fmtEUR(p.value)}` : p.value.toLocaleString("en-GB")}</b></div>
      ))}
    </div>
  );
}

export interface Series { key: string; name: string; color?: string; type?: "bar" | "line" | "area"; dashed?: boolean }

export function TimeChart({ data, series, height = 260, xKey = "month", money = true, onPoint }: { data: Record<string, unknown>[]; series: Series[]; height?: number; xKey?: string; money?: boolean; onPoint?: (x: string) => void }) {
  return (
    <div style={{ height }} role="img" aria-label="Time series chart">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ top: 6, right: 8, left: 0, bottom: 0 }} onClick={(e) => { const l = (e as { activeLabel?: string } | null)?.activeLabel; if (l && onPoint) onPoint(l); }} style={onPoint ? { cursor: "pointer" } : undefined}>
          {grid}
          <XAxis dataKey={xKey} tick={axis} tickFormatter={(v) => (/^\d{4}-\d{2}$/.test(String(v)) ? fmtMonth(v) : String(v))} axisLine={false} tickLine={false} minTickGap={16} />
          <YAxis tick={axis} tickFormatter={(v) => fmtEUR(v, true)} axisLine={false} tickLine={false} width={46} />
          <Tooltip content={<Tip money={money} labelFmt={(l) => (/^\d{4}-\d{2}$/.test(l) ? fmtMonth(l) : l)} />} />
          <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12 }} />
          {series.map((s, i) => {
            const c = s.color ?? PALETTE[i % PALETTE.length];
            return s.type === "bar" ? <Bar isAnimationActive={false} key={s.key} dataKey={s.key} name={s.name} fill={c} radius={[2, 2, 0, 0]} maxBarSize={22} />
              : s.type === "area" ? <Area isAnimationActive={false} key={s.key} dataKey={s.key} name={s.name} stroke={c} fill={c} fillOpacity={0.14} strokeWidth={2} type="monotone" connectNulls />
              : <Line isAnimationActive={false} key={s.key} dataKey={s.key} name={s.name} stroke={c} strokeWidth={2} strokeDasharray={s.dashed ? "5 4" : undefined} dot={false} type="monotone" connectNulls />;
          })}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

export function AreaTrend({ data, series, height = 260 }: { data: Record<string, unknown>[]; series: Series[]; height?: number }) {
  return (
    <div style={{ height }} role="img" aria-label="Area chart">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 6, right: 8, left: 0, bottom: 0 }}>
          {grid}
          <XAxis dataKey="month" tick={axis} tickFormatter={fmtMonth} axisLine={false} tickLine={false} minTickGap={16} />
          <YAxis tick={axis} tickFormatter={(v) => fmtEUR(v, true)} axisLine={false} tickLine={false} width={46} />
          <Tooltip content={<Tip labelFmt={fmtMonth} />} /><Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12 }} />
          {series.map((s, i) => <Area isAnimationActive={false} key={s.key} dataKey={s.key} name={s.name} stroke={s.color ?? PALETTE[i]} fill={s.color ?? PALETTE[i]} fillOpacity={0.15} strokeWidth={2} type="monotone" />)}
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

export function HBars({ data, height, onBar, money = true, color = "#687A58", activeKey }: { data: { key?: string; label: string; value: number }[]; height?: number; onBar?: (key: string) => void; money?: boolean; color?: string; activeKey?: string }) {
  const h = height ?? Math.max(180, data.length * 30 + 20);
  return (
    <div style={{ height: h }} role="img" aria-label="Bar chart">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ top: 0, right: 12, left: 0, bottom: 0 }}>
          <CartesianGrid stroke="#E5E6DD" strokeDasharray="3 3" horizontal={false} />
          <XAxis type="number" tick={axis} tickFormatter={(v) => (money ? fmtEUR(v, true) : v.toLocaleString("en-GB"))} axisLine={false} tickLine={false} />
          <YAxis type="category" dataKey="label" tick={{ ...axis, fill: "#292D27" }} width={130} axisLine={false} tickLine={false} tickFormatter={(v: string) => (v.length > 20 ? v.slice(0, 19) + "…" : v)} />
          <Tooltip content={<Tip money={money} />} cursor={{ fill: "#F2EFE6" }} />
          <Bar isAnimationActive={false} dataKey="value" name="Value" radius={[0, 2, 2, 0]} maxBarSize={18} onClick={(d) => onBar && (d as unknown as { key?: string; label: string }).key !== undefined && onBar((d as unknown as { key: string }).key)} style={onBar ? { cursor: "pointer" } : undefined}>
            {data.map((d, i) => <Cell key={i} fill={activeKey && d.key !== activeKey ? "#CFD5C6" : color} />)}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function Donut({ data, onSlice, height = 230 }: { data: { key: string; label: string; value: number }[]; onSlice?: (key: string) => void; height?: number }) {
  const total = data.reduce((s, d) => s + d.value, 0);
  return (
    <div className="flex flex-col items-center gap-2 sm:flex-row" style={{ minHeight: height }}>
      <div className="h-[190px] w-[190px] shrink-0" role="img" aria-label="Donut chart">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie isAnimationActive={false} data={data} dataKey="value" nameKey="label" innerRadius={56} outerRadius={86} paddingAngle={1.5} stroke="#fff" onClick={(d) => onSlice?.((d as unknown as { key: string }).key)} style={onSlice ? { cursor: "pointer" } : undefined}>
              {data.map((_, i) => <Cell key={i} fill={PALETTE[i % PALETTE.length]} />)}
            </Pie>
            <Tooltip content={<Tip />} />
          </PieChart>
        </ResponsiveContainer>
      </div>
      <ul className="w-full space-y-1.5 text-sm">
        {data.map((d, i) => (
          <li key={d.key} className="flex items-center justify-between gap-2">
            <button className="flex min-w-0 items-center gap-2 text-left hover:text-forest" onClick={() => onSlice?.(d.key)}><span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: PALETTE[i % PALETTE.length] }} /><span className="truncate">{d.label}</span></button>
            <span className="tabular-nums text-muted">{total ? Math.round((d.value / total) * 100) : 0}%</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function LineSimple({ data, xKey, series, height = 240, forecastFrom }: { data: Record<string, unknown>[]; xKey: string; series: Series[]; height?: number; forecastFrom?: string }) {
  return (
    <div style={{ height }} role="img" aria-label="Line chart">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 6, right: 8, left: 0, bottom: 0 }}>
          {grid}
          <XAxis dataKey={xKey} tick={axis} tickFormatter={(v) => (/^\d{4}-\d{2}$/.test(String(v)) ? fmtMonth(v) : String(v))} axisLine={false} tickLine={false} minTickGap={16} />
          <YAxis tick={axis} tickFormatter={(v) => fmtEUR(v, true)} axisLine={false} tickLine={false} width={46} />
          <Tooltip content={<Tip />} /><Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12 }} />
          {forecastFrom && <ReferenceLine x={forecastFrom} stroke="#B5A17B" strokeDasharray="4 4" label={{ value: "Forecast", fontSize: 10, fill: "#B5A17B", position: "insideTopRight" }} />}
          {series.map((s, i) => <Line isAnimationActive={false} key={s.key} dataKey={s.key} name={s.name} stroke={s.color ?? PALETTE[i]} strokeWidth={2} strokeDasharray={s.dashed ? "5 4" : undefined} dot={false} type="monotone" connectNulls />)}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
