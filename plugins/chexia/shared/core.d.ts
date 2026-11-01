/** shared/core.js 的类型声明（面板 tsc strict 用；口径以 core.js 为权威） */
export declare const DAY_MS: number;
export declare const NAME_CAP: number;
export declare const NOTE_CAP: number;
export declare const RATE_WINDOW_DAYS: number;
export declare const CONS_WINDOW_DAYS: number;
export declare const MIN_SPAN_KM: number;
export declare const CAR_KINDS: string[];
export declare const CAR_KIND_LABELS: Record<string, string>;
export declare const CAR_KIND_UNITS: Record<string, string>;
export declare const ENERGY_KINDS: string[];
export declare const SVC_TYPES: string[];
export declare const SVC_TYPE_LABELS: Record<string, string>;
export declare const DOC_TYPES: string[];

export declare function clip(s: unknown, cap: number): string;
export declare function idFor(seed: string): string;
export declare function dayKey(ts?: number): string;
export declare function parseDayKey(s: string): number | null;
export declare function dayDiff(a: string, b: string): number;
export declare function addDaysStr(dateStr: string, n: number): string | null;
export declare function addMonthsStr(dateStr: string, n: number): string | null;
export declare function r1(x: number): number;
export declare function r2(x: number): number;
export declare function fmtNum(x: number): string;

export interface Car {
  id: string; name: string; kind: 'fuel' | 'ev' | 'phev'; plate: string
  initialOdometer: number; note: string; createdAt: number; updatedAt: number; rev: number
}
export interface Energy {
  id: string; carId: string; kind: 'fuel' | 'charge'; date: string
  odometer: number; amount: number; cost: number; filled: boolean
  station: string; note: string; createdAt: number; updatedAt: number; rev: number
}
export interface Cycle { kmInterval?: number; monthInterval?: number }
export interface Item {
  id: string; carId: string; name: string; cycle: Cycle
  lastOdometer?: number; lastDate?: string; active: boolean
  note: string; createdAt: number; updatedAt: number; rev: number
}
export interface Svc {
  id: string; carId: string; type: 'maintenance' | 'repair' | 'inspection' | 'insurance' | 'other'
  date: string; odometer?: number; desc: string; cost?: number; vendor: string
  itemName: string; note: string; createdAt: number; updatedAt: number; rev: number
}
export interface Doc {
  id: string; carId: string; type: string; expiry: string
  remindDays?: number; note: string; createdAt: number; updatedAt: number; rev: number
}
export interface Settings {
  docWarnDays: number; itemWatchKm: number; itemWatchDays: number; costWindowDays: number
}

export declare function normalizeCar(raw: Partial<Car> & Record<string, unknown>, existing?: Car | null): { error: string } | { car: Car }
export declare function normalizeEnergy(raw: Partial<Energy> & Record<string, unknown>, existing?: Energy | null, car?: Car | null): { error: string } | { energy: Energy }
export declare function normalizeItem(raw: Partial<Item> & Record<string, unknown>, existing?: Item | null): { error: string } | { item: Item }
export declare function normalizeSvc(raw: Partial<Svc> & Record<string, unknown>, existing?: Svc | null): { error: string } | { svc: Svc }
export declare function normalizeDoc(raw: Partial<Doc> & Record<string, unknown>, existing?: Doc | null): { error: string } | { doc: Doc }
export declare function normalizeSettings(raw: unknown): Settings
export declare function unitOf(car: Car | null): string

export declare function latestOdometer(energies: Energy[], svcs: Svc[], car: Car): number
export declare function mileageRate(energies: Energy[], svcs: Svc[], car: Car, nowTs?: number):
  { rate: number; source: 'window' | 'span' | 'lifetime'; days: number; km: number } | { rate: null; source: 'none' }
export interface Consumption {
  ok: true; unit: string; estimated: boolean; per100: number; costPerKm: number | null
  kmSpan: number; days: number; amount: number; cost: number; since: string; until: string
}
export declare function periodConsumption(energies: Energy[], car: Car, today: string, sinceDate?: string | null):
  Consumption | { ok: false; reason: string; unit: string }
export interface ItemProj {
  state: 'overdue' | 'due' | 'watch' | 'ok'; axis: 'km' | 'time' | null
  dueKm?: number; kmLeft?: number; daysLeftByKm?: number | null
  dueDate?: string; daysLeftByTime?: number; _pick?: 'km' | 'time'
}
export declare function itemProjection(item: Item, car: Car | null, energies: Energy[], svcs: Svc[], nowTs?: number, settings?: Settings | null): ItemProj
export declare function describeItem(item: Item): string
export interface DocBand {
  docId: string; type: string; expiry: string; days: number
  band: 'expired' | 'soon' | 'ok'; carName: string; note: string
}
export declare function docBands(docs: Doc[], cars: Car[], nowTs?: number, settings?: Settings | null): DocBand[]
export interface CostBucket {
  month: string; energy: number; maintenance: number; repair: number
  inspection: number; insurance: number; other: number; total: number
}
export interface CostBreak {
  windowDays: number; energyCost: number; serviceCost: number; total: number
  costPerKm: number | null; perMonth: CostBucket[]
}
export declare function costBreakdown(energies: Energy[], svcs: Svc[], car: Car, today: string, windowDays?: number): CostBreak
export interface CarSnap {
  carId: string; name: string; kind: Car['kind']; plate: string; unit: string
  odometer: number; kmPerDay: number | null; rateSource: string
  consumption: { per100: number; costPerKm: number | null; unit: string; since: string; until: string; kmSpan: number; estimated: boolean } | null
  consumptionNote: string
  items: { itemId: string; name: string; describe: string; projection: ItemProj }[]
  docsDue: DocBand[]
  cost: CostBreak
}
export interface FamilySnap { at: number; cars: CarSnap[]; personalDocs: DocBand[] }
export declare function carSnapshot(car: Car, energies: Energy[], items: Item[], svcs: Svc[], docs: Doc[], nowTs?: number, settings?: Settings | null): CarSnap
export declare function familySnapshot(cars: Car[], energies: Energy[], items: Item[], svcs: Svc[], docs: Doc[], nowTs?: number, settings?: Settings | null): FamilySnap
export declare function exportAll(data: { cars: Car[]; energies: Energy[]; items: Item[]; svcs: Svc[]; docs: Doc[]; settings: Settings | null }): string
