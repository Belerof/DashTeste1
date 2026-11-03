// Original botanical artwork (SVG) in the PHYTO-inspired palette. No third-party imagery is used.
export function LeafMark({ size = 28, color = "#354A39" }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden>
      <path d="M16 29V13" stroke={color} strokeWidth="1.4" strokeLinecap="round" />
      <path d="M16 15C9 15 5 10.5 5 4c7 0 11 4 11 11Z" fill={color} />
      <path d="M16 20c6 0 10-3.5 10-9-6 0-10 3-10 9Z" fill={color} opacity=".62" />
      <path d="M16 25c-4.5 0-7.5-2.4-7.5-6.5 4.6 0 7.5 2.2 7.5 6.5Z" fill={color} opacity=".35" />
    </svg>
  );
}

export function Logo({ collapsed = false, light = false }: { collapsed?: boolean; light?: boolean }) {
  const c = light ? "#F7F7F2" : "#354A39";
  return (
    <div className="flex items-center gap-2.5">
      <LeafMark size={26} color={c} />
      {!collapsed && (
        <div className="leading-none">
          <div className="font-serif text-[22px] tracking-[.18em]" style={{ color: c }}>PHYTO</div>
          <div className="mt-1 text-[8.5px] uppercase tracking-[.28em]" style={{ color: light ? "#AAB49C" : "#777B70" }}>Commercial Intelligence</div>
        </div>
      )}
    </div>
  );
}

/** Large decorative foliage used on the login page and empty states. */
export function Foliage({ className = "" }: { className?: string }) {
  const leaf = (x: number, y: number, r: number, s: number, fill: string, o = 1) => (
    <g transform={`translate(${x} ${y}) rotate(${r}) scale(${s})`} opacity={o}>
      <path d="M0 0C40-30 120-30 170 0 120 30 40 30 0 0Z" fill={fill} />
      <path d="M0 0H165" stroke="#F7F7F2" strokeOpacity=".35" strokeWidth="1.5" />
      {[28, 55, 82, 110, 135].map((t) => (<g key={t}><path d={`M${t} 0 L${t + 22} -14`} stroke="#F7F7F2" strokeOpacity=".22" /><path d={`M${t} 0 L${t + 22} 14`} stroke="#F7F7F2" strokeOpacity=".22" /></g>))}
    </g>
  );
  return (
    <svg viewBox="0 0 600 800" className={className} preserveAspectRatio="xMidYMid slice" aria-hidden>
      <defs>
        <linearGradient id="fol-bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#2c3e30" /><stop offset="1" stopColor="#4d6150" /></linearGradient>
        <radialGradient id="fol-glow" cx=".3" cy=".25" r=".7"><stop offset="0" stopColor="#B5A17B" stopOpacity=".28" /><stop offset="1" stopColor="#B5A17B" stopOpacity="0" /></radialGradient>
      </defs>
      <rect width="600" height="800" fill="url(#fol-bg)" />
      <rect width="600" height="800" fill="url(#fol-glow)" />
      <path d="M300 820C310 600 280 420 330 120" stroke="#AAB49C" strokeOpacity=".55" strokeWidth="2.5" fill="none" />
      {leaf(305, 700, -55, 1.15, "#687A58", .9)}{leaf(300, 640, -125, 1.0, "#7d9069", .85)}{leaf(312, 560, -48, 1.05, "#AAB49C", .75)}
      {leaf(305, 480, -132, .95, "#687A58", .85)}{leaf(318, 400, -50, .9, "#8fa27c", .8)}{leaf(316, 330, -128, .8, "#AAB49C", .7)}
      {leaf(326, 250, -52, .7, "#687A58", .8)}{leaf(330, 190, -120, .6, "#B5A17B", .55)}
      {leaf(80, 800, -70, 1.3, "#3f5643", .8)}{leaf(540, 820, -110, 1.2, "#3f5643", .8)}
      <circle cx="470" cy="150" r="46" fill="#F2EFE6" fillOpacity=".08" /><circle cx="470" cy="150" r="78" fill="none" stroke="#F2EFE6" strokeOpacity=".12" />
    </svg>
  );
}
