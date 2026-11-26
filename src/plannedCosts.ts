import type { Entity, Entry } from "./model";

// Collaborators converting the same saved estimate create the same expense ID.
// The normal version checks then surface a conflict instead of duplicate spending.
export async function plannedExpenseId(entry: Entity<Entry>) {
  const bytes = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(
      `planned-cost:${entry.tripId}:${entry.id}:${entry.version}`,
    ),
  );
  const hex = Array.from(new Uint8Array(bytes).slice(0, 16), (b) =>
    b.toString(16).padStart(2, "0"),
  );
  hex[6] = "5" + hex[6].slice(1);
  hex[8] = ((parseInt(hex[8], 16) & 0x3f) | 0x80).toString(16);
  const id = hex.join("");
  return `${id.slice(0, 8)}-${id.slice(8, 12)}-${id.slice(12, 16)}-${id.slice(16, 20)}-${id.slice(20)}`;
}
