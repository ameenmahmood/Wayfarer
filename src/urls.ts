export const appBasePath = import.meta.env.BASE_URL;
export const appBaseUrl = new URL(appBasePath, window.location.origin).href;
export function legalUrl(configured: string | undefined, fallback: string) {
  const value = configured || fallback;
  return /^https?:\/\//i.test(value)
    ? value
    : new URL(value.replace(/^\//, ""), appBaseUrl).href;
}
