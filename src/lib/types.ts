export type Id = string;

export interface Country { code: string; name: string; currency: string; fx: number }
export interface Category { id: Id; name: string }
export interface Product { sku: string; name: string; brand: string; categoryId: Id; priceEUR: number }
export interface Customer { id: Id; name: string; country: string; channel: string; repId: Id }
export interface Rep { id: Id; name: string; country: string }

export type SaleStatus = "Paid" | "Invoiced" | "Pending" | "Overdue" | "Credited";
export interface SaleLine {
  id: Id; invoice: string; date: string; customerId: Id; sku: string;
  qty: number; unitPrice: number; total: number; currency: string; fx: number; totalEUR: number;
  repId: Id; status: SaleStatus;
}
export interface SelloutRecord {
  id: Id; date: string; customerId: Id; channel: string; sku: string;
  units: number; value: number; currency: string; fx: number; valueEUR: number; source: string;
}
export interface Target {
  id: Id; scope: "country" | "customer" | "rep"; refId: Id; year: number; month: number | null; amountEUR: number;
}

/** Data access restrictions. An empty list means "no restriction on that dimension". */
export interface DataScope { countries: string[]; customers: Id[]; brands: string[]; categories: Id[]; reps: Id[] }

export interface Role { id: Id; name: string; description: string; permissions: string[]; system: boolean }
export type UserStatus = "active" | "invited" | "inactive";
export interface AppUser {
  id: Id; name: string; email: string; roleId: Id; country: string; department: string; jobTitle: string;
  status: UserStatus; lastLogin: string | null; scope: DataScope; avatar?: string; language: string;
  notifyPrefs: Record<string, boolean>; demo?: boolean;
}
export interface AuditEntry { id: Id; at: string; userId: Id | null; userName: string; action: string; target: string; detail?: string }
export interface Notification { id: Id; at: string; userId: Id | "all"; type: string; title: string; body: string; read: boolean; severity: "info" | "success" | "warning" | "error" }
export interface ImportRecord { id: Id; at: string; userName: string; kind: "sales" | "sellout"; fileName: string; rows: number; imported: number; errors: number; status: "completed" | "completed_with_errors" | "failed" }

export interface Filters {
  from?: string; to?: string; countries?: string[]; customers?: string[]; products?: string[];
  brands?: string[]; reps?: string[]; channels?: string[]; categories?: string[];
}
