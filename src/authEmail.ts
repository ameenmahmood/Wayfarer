// A UI courtesy, not a replacement for Supabase's server-side rate limits.
const retryTimes = new Map<string, number>();
export const authEmailKey = (email: string) => email.trim().toLowerCase();
export function emailRetryAt(email: string) {
  return retryTimes.get(authEmailKey(email)) || 0;
}
export function rememberEmailRequest(email: string, seconds = 60) {
  const now = Date.now();
  for (const [key, until] of retryTimes)
    if (until <= now) retryTimes.delete(key);
  const until = now + Math.max(60, Math.min(seconds, 3600)) * 1000;
  retryTimes.set(authEmailKey(email), until);
  return until;
}
export function authEmailFailure(error: {
  code?: string;
  status?: number;
  name?: string;
  message?: string;
}) {
  const code = /^[a-z][a-z0-9_]{2,80}$/.test(error.code || "")
    ? error.code!
    : "request_failed";
  const seconds =
    Number(error.message?.match(/after\s+(\d+)\s+seconds?/i)?.[1]) || 60;
  if (
    error.status === 429 ||
    ["over_email_send_rate_limit", "over_request_rate_limit"].includes(code)
  )
    return {
      code,
      retrySeconds: seconds,
      message:
        "Too many email requests. Please wait before trying again. If this keeps happening, ask the trip owner to check the email sending limit.",
    };
  if (
    ["signup_disabled", "email_provider_disabled", "otp_disabled"].includes(
      code,
    )
  )
    return {
      code,
      message:
        "Email sign-in or first-time accounts are disabled on the server. Ask the trip owner to check the authentication settings.",
    };
  if (code === "email_address_not_authorized")
    return {
      code,
      message:
        "The email service cannot send to this address. The trip owner needs to check the email provider’s recipient restrictions.",
    };
  if (["email_address_invalid", "validation_failed"].includes(code))
    return { code, message: "Check the email address and try again." };
  if (
    error.name === "AuthRetryableFetchError" ||
    !error.status ||
    error.status === 0
  )
    return {
      code,
      retrySeconds: 60,
      message:
        "The email request could not be confirmed. Check your connection and inbox before retrying; the request may have reached the server.",
    };
  return {
    code,
    message:
      "The sign-in email could not be requested. Try again, or ask the trip owner to check the email provider and authentication logs.",
  };
}
