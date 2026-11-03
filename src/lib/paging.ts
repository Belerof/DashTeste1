export function pageRows<T extends Record<string, unknown>>(rows: T[], u: URL, searchKeys: string[]) {
  const q = (u.searchParams.get("q") ?? "").toLowerCase();
  const status = u.searchParams.get("status");
  let r = rows;
  if (q) r = r.filter((x) => searchKeys.some((k) => String(x[k] ?? "").toLowerCase().includes(q)));
  if (status) r = r.filter((x) => x.status === status);
  const sort = u.searchParams.get("sort") || "date";
  const dir = u.searchParams.get("dir") === "asc" ? 1 : -1;
  r = [...r].sort((a, b) => {
    const x = a[sort], y = b[sort];
    return (typeof x === "number" && typeof y === "number" ? x - y : String(x ?? "").localeCompare(String(y ?? ""))) * dir;
  });
  const size = Math.min(200, Math.max(5, Number(u.searchParams.get("size")) || 25));
  const p = Math.max(1, Number(u.searchParams.get("page")) || 1);
  return { rows: r.slice((p - 1) * size, p * size), total: r.length, page: p, size, value: Math.round(r.reduce((s, x) => s + Number(x.totalEUR ?? x.valueEUR ?? 0), 0)) };
}

