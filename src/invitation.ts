const key = "wayfarer-pending-invitation";
export function pendingInvitation(): string {
  const token = new URLSearchParams(location.search).get("invite");
  try {
    if (token) {
      sessionStorage.setItem(
        key,
        JSON.stringify({ token, expires: Date.now() + 7 * 86400000 }),
      );
      return token;
    }
    const saved = JSON.parse(sessionStorage.getItem(key) || "null");
    if (saved?.expires > Date.now() && typeof saved.token === "string")
      return saved.token;
    sessionStorage.removeItem(key);
  } catch {
    /* Joining from the URL still works when storage is unavailable. */
  }
  return token || "";
}
export function clearInvitation() {
  try {
    sessionStorage.removeItem(key);
  } catch {
    /* Storage is optional. */
  }
}
