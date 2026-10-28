/** Preserve Google's actionable rejection reason without returning credentials. */
export function googleFailure(status: number, body: any, key: string) {
  const message =
    typeof body?.error?.message === "string"
      ? body.error.message
      : "Check billing, API enablement, quota, and key restrictions.";
  const reason = body?.error?.details?.find(
    (detail: any) => typeof detail.reason === "string",
  )?.reason;
  return `Google request failed (${status}): ${message}${reason ? ` [${reason}]` : ""}`
    .split(key)
    .join("[redacted]")
    .replace(/AIza[0-9A-Za-z_-]+/g, "[redacted]")
    .slice(0, 1200);
}
