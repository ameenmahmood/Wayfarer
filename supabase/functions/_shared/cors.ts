/** Keep the SDK's required headers while allowing only explicit application origins. */
export function serviceCors(
  requestOrigin: string | null,
  origins: string[],
  sdkHeaders: Record<string, string>,
) {
  const allowed = !requestOrigin || origins.includes(requestOrigin);
  return {
    allowed,
    headers: {
      ...sdkHeaders,
      "Access-Control-Allow-Origin":
        allowed && requestOrigin ? requestOrigin : origins[0],
      "Access-Control-Allow-Methods": "POST,OPTIONS",
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      Vary: "Origin",
    },
  };
}
