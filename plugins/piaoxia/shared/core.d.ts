/** shared/core.js 的手工 TS 类型面（供 src/ strict 引用；运行时真身在 core.js） */
export declare const K: {
  INVOICE: string;
  TITLE: string;
  META: string;
};
export declare const KINDS: Record<string, string>;
export declare const STATUSES: Record<string, string>;
export declare const TRANSITIONS: Record<string, string[]>;
export declare const PURPOSES: Record<string, string>;
export declare const CATEGORIES: Record<string, string>;
export declare const MIN_SAMPLE: number;

export interface Party {
  name: string;
  taxId: string;
}
export interface Item {
  name: string;
  amount?: number;
  qty?: number;
}
export interface Invoice {
  id: string;
  number: string;
  code: string;
  kind: string;
  title: string;
  date: string;
  buyer: Party;
  seller: Party;
  items: Item[];
  amount: number | null;
  tax: number | null;
  total: number;
  category: string;
  purpose: string;
  status: string;
  reimburseId: string;
  submittedAt: string;
  settledAt: string;
  rejectNote: string;
  warrantyMonths: number | null;
  warrantyUntil: string;
  source: 'collect' | 'manual';
  srcPath: string;
  fileName: string;
  fileSha256: string;
  archivedPath: string;
  note: string;
  createdAt: string;
  updatedAt: string;
}
export interface Title {
  id: string;
  name: string;
  taxId: string;
  bank: string;
  account: string;
  address: string;
  phone: string;
  isDefault: boolean;
  note: string;
  createdAt: string;
  updatedAt: string;
}
export interface PiaoSettings {
  v: number;
}

export declare function clip(s: unknown, n: number): string;
export declare function normName(s: unknown): string;
export declare function displayName(s: unknown): string;
export declare function idFor(seed: string): string;
export declare function invoiceId(inv: Partial<Invoice>): string;
export declare function digitsOnly(s: unknown): string;
export declare function num2(v: unknown): string;
export declare function parseTs(v: unknown): number | null;
export declare function dateKeyOf(v: unknown): string;
export declare function monthKeyOf(v: unknown): string;
export declare function todayKey(nowMs?: number): string;
export declare function addMonths(dateKey: string, months: number): string;
export declare function daysBetween(fromKey: string, toKey: string): number | null;
export declare function classifyCategory(sellerName: string, itemNames: string[], kindHint?: string): string;
export declare function normalizeInvoice(raw: Partial<Invoice> | null, prev?: Invoice | null): Invoice;
export declare function canTransition(from: string, to: string): { ok: boolean; message: string };
export declare function applyTransition(
  inv: Invoice,
  to: string,
  opts?: { nowMs?: number; nowIso?: string; reimburseId?: string; rejectNote?: string },
): Invoice;
export declare function normalizeTitle(raw: Partial<Title> | null, prev?: Title | null): Title;
export declare function titleCopyText(t: Title | null): string;

export interface CatRow { key: string; label: string; count: number; total: number }
export interface MonthRow { key: string; count: number; total: number }
export interface SellerRow { name: string; count: number; total: number }
export interface ReimburseGroup { id: string; count: number; total: number; statuses: Record<string, number>; latest: string }
export interface WarrantyRow { inv: Invoice; daysLeft: number }
export interface View {
  today: string;
  thisMonth: string;
  counts: { all: number; byStatus: Record<string, { count: number; total: number }> };
  pending: {
    count: number;
    total: number;
    list: Invoice[];
    stale: Invoice[];
  };
  inFlight: { count: number; total: number };
  month: {
    opened: { count: number; total: number };
    settled: { count: number; total: number };
    submitted: { count: number; total: number };
  };
  year: { key: string; total: number; count: number };
  byCategory: CatRow[];
  byMonth: MonthRow[];
  sellers: SellerRow[];
  reimburseGroups: ReimburseGroup[];
  warrantyUpcoming: WarrantyRow[];
  minSample: number;
}
export declare function buildView(invoices: Invoice[], titles: Title[], nowMs?: number): View;

export declare const CSV_COLUMNS: string[];
export declare function exportCSV(invoices: Invoice[]): string;
export declare function parseCSV(text: string): string[][];
export declare function importCSV(text: string): { drafts: Invoice[]; warns: string[] };
export declare function labelToKey(dict: Record<string, string>, label: string): string | null;
