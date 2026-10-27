export type Role = "owner" | "editor" | "viewer";
export type Kind =
  "trip" | "entry" | "expense" | "repayment" | "packing" | "template";
export type Person = { id: string; name: string; email?: string; role: Role };
export type Trip = {
  title: string;
  destinations: string;
  start: string;
  end: string;
  zone: string;
  currency: string;
  budget: number;
  categoryBudgets: Record<string, number>;
  people: Person[];
  description: string;
};
export type Entry = {
  title: string;
  type: string;
  date: string;
  endDate: string;
  start: string;
  end: string;
  duration: number;
  zone: string;
  endZone?: string;
  address: string;
  lat?: number;
  lng?: number;
  placeId?: string;
  notes: string;
  link: string;
  reservation: string;
  cost: number;
  currency: string;
  fixed: boolean;
  order: number;
  opening?: { open: number; close: number };
};
export type SplitMode = "equal" | "exact" | "percentage" | "weighted";
export type Expense = {
  title: string;
  category: string;
  date: string;
  notes: string;
  payer: string;
  currency: string;
  total: number;
  participants: string[];
  mode: SplitMode;
  shares: Record<string, number>;
  items: { title: string; amount: number; participants: string[] }[];
  tax: number;
  tip: number;
  fees: number;
  extraMode: "equal" | "proportional";
  rate: { num: number; den: number; date: string; source: string };
  entryId?: string;
};
export type Repayment = {
  from: string;
  to: string;
  amount: number;
  date: string;
  notes: string;
};
export type Packing = {
  title: string;
  category: string;
  quantity: number;
  notes: string;
  assigned: string;
  personal: boolean;
  packed: boolean;
};
export type Entity<T = any> = {
  id: string;
  tripId: string;
  kind: Kind;
  data: T;
  version: number;
  updatedAt: string;
  updatedBy: string;
  deleted: boolean;
};
export type Mutation = {
  id: string;
  entityId: string;
  tripId: string;
  baseVersion: number;
  sequence: number;
  entity: Entity;
  state: "pending" | "conflict" | "failed";
  error?: string;
  remote?: any;
};
export const uid = () => crypto.randomUUID();
export const today = () => new Date().toISOString().slice(0, 10);
export function days(start: string, end: string) {
  const out: string[] = [];
  for (
    let d = new Date(start + "T12:00:00Z");
    d.toISOString().slice(0, 10) <= end && out.length < 90;
    d.setUTCDate(d.getUTCDate() + 1)
  )
    out.push(d.toISOString().slice(0, 10));
  return out;
}
export function makeEntity<T>(
  kind: Kind,
  tripId: string,
  data: T,
  by = "local-owner",
): Entity<T> {
  return {
    id: kind === "trip" ? tripId : uid(),
    tripId,
    kind,
    data,
    version: 0,
    updatedAt: new Date().toISOString(),
    updatedBy: by,
    deleted: false,
  };
}
export const currencies = [
  "USD",
  "EUR",
  "GBP",
  "JPY",
  "CAD",
  "AUD",
  "CHF",
  "INR",
  "KRW",
  "KWD",
  "BHD",
  "CLP",
];
