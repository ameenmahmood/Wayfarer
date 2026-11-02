/** Account names are separate from trip membership and never inferred from email. */
export type Profile = { user_id: string; display_name: string };
export let profileState: "loading" | "ready" | "unavailable" = "loading";
export let profileIssue = "";
export let ownDisplayName = "";
let names: Record<string, string> = {};
export function normalizeDisplayName(value: string) {
  const name = value.trim().replace(/\s+/g, " ");
  if (
    !name ||
    [...name].length > 60 ||
    /[\u0000-\u001f\u007f]/.test(value) ||
    name.includes("@")
  )
    throw Error(
      "Enter a name of 1–60 characters, without an email address or control characters.",
    );
  return name;
}
export function applyProfiles(rows: Profile[], account: string, ready = true) {
  names = Object.fromEntries(rows.map((p) => [p.user_id, p.display_name]));
  ownDisplayName = names[account] || "";
  profileState = ready ? "ready" : "unavailable";
  profileIssue = "";
}
export function profileFailure(message: string) {
  profileState = "unavailable";
  profileIssue = message;
}
export function profileRows(): Profile[] {
  return Object.entries(names).map(([user_id, display_name]) => ({
    user_id,
    display_name,
  }));
}
export function displayNameFor(
  id: string,
  legacy = "",
  current = "",
  allowLegacy = false,
) {
  if (names[id]) return names[id];
  if (
    allowLegacy &&
    legacy &&
    !legacy.includes("@") &&
    legacy !== "You" &&
    legacy !== "Invited member"
  )
    return legacy;
  return id && id === current ? "You" : "Traveler";
}
