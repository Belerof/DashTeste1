import { route } from "@/lib/guard";
import { latestMonth, monthEnd } from "@/lib/analytics";
import { master } from "@/lib/store";

export const GET = route(null, async ({ scope }) => {
  const ok = (l: string[], v: string) => l.length === 0 || l.includes(v);
  const customers = master.customers.filter((c) => ok(scope.countries, c.country) && ok(scope.customers, c.id) && ok(scope.reps, c.repId));
  const products = master.products.filter((p) => ok(scope.brands, p.brand) && ok(scope.categories, p.categoryId));
  const lm = latestMonth();
  return {
    countries: master.countries.filter((c) => ok(scope.countries, c.code)).map((c) => ({ value: c.code, label: c.name })),
    customers: customers.map((c) => ({ value: c.id, label: c.name, country: c.country })),
    products: products.map((p) => ({ value: p.sku, label: `${p.name} (${p.sku})`, brand: p.brand })),
    brands: [...new Set(products.map((p) => p.brand))].map((b) => ({ value: b, label: b })),
    reps: master.reps.filter((r) => ok(scope.countries, r.country) && ok(scope.reps, r.id)).map((r) => ({ value: r.id, label: r.name })),
    channels: master.channels.map((c) => ({ value: c, label: c })),
    categories: master.categories.filter((c) => ok(scope.categories, c.id)).map((c) => ({ value: c.id, label: c.name })),
    defaultRange: { from: `${lm.slice(0, 4)}-01-01`, to: monthEnd(lm) },
    latestMonth: lm,
    sources: master.sources,
  };
});
