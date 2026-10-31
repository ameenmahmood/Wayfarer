import {
  authEmailKey,
  emailRetryAt,
  rememberEmailRequest,
  authEmailFailure,
} from "./authEmail";
import { useEffect, useRef, useState } from "react";
import { appBaseUrl } from "./urls";
import { supabase } from "./store";
import { Button, Field, Notice, useAsyncAction } from "./ui";

/** Also works inside the trip form without nesting HTML forms. */
export default function SignIn({
  purpose = "Open your private trips and collaborate with invited friends.",
  plain = false,
}: {
  purpose?: string;
  plain?: boolean;
}) {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [requestedEmail, setRequestedEmail] = useState("");
  const [retryAt, setRetryAt] = useState(0);
  const [now, setNow] = useState(Date.now());
  const [errorCode, setErrorCode] = useState("");
  const remaining = Math.max(0, Math.ceil((retryAt - now) / 1000));
  useEffect(() => {
    if (!retryAt) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [retryAt]);
  const input = useRef<HTMLInputElement>(null);
  const a = useAsyncAction();
  function send() {
    const address = authEmailKey(email);
    if (
      !input.current?.reportValidity() ||
      a.busy ||
      emailRetryAt(address) > Date.now()
    )
      return;
    setSent(false);
    setErrorCode("");
    void a.run(async () => {
      if (!navigator.onLine)
        throw Error(
          "You’re offline. Connect to the internet to request a sign-in email.",
        );
      try {
        const { error } = await supabase!.auth.signInWithOtp({
          email: address,
          options: { emailRedirectTo: appBaseUrl, shouldCreateUser: true },
        });
        if (error) throw error;
        setRequestedEmail(address);
        setEmail(address);
        setNow(Date.now());
        setRetryAt(rememberEmailRequest(address));
        setSent(true);
      } catch (error: any) {
        const failure = authEmailFailure(error);
        setErrorCode(failure.code);
        if (failure.retrySeconds) {
          setNow(Date.now());
          setRetryAt(rememberEmailRequest(address, failure.retrySeconds));
        }
        throw Error(failure.message);
      }
    });
  }
  return (
    <section className={"sign-in-panel " + (plain ? "plain" : "inset")}>
      {!plain && <h3>Sign in with email</h3>}
      <p>{purpose}</p>
      <Field label="Email">
        <input
          ref={input}
          required
          type="email"
          autoComplete="email"
          value={email}
          onChange={(e) => {
            setEmail(e.target.value);
            setSent(false);
            a.setError("");
            setErrorCode("");
            setNow(Date.now());
            setRetryAt(emailRetryAt(e.target.value));
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              send();
            }
          }}
        />
      </Field>
      <Button
        className="primary"
        disabled={a.busy || remaining > 0}
        onClick={send}
      >
        {a.busy
          ? "Sending link..."
          : remaining > 0
            ? `Request again in ${remaining}s`
            : sent
              ? "Send another sign-in link"
              : "Email a sign-in link"}
      </Button>
      {sent && (
        <Notice>
          <strong>Sign-in email requested</strong>
          <p>
            A confirmation or sign-in email was requested for{" "}
            <b>{requestedEmail}</b>. Delivery can take a few minutes.
          </p>
          <p>
            First time here? Look for an email asking you to confirm your email
            address. Check Spam/Junk and Promotions too.
          </p>
          <small>
            Open the newest link. If you have a trip draft, use this same
            browser tab to return to it. Requesting a new link can invalidate
            the earlier one.
          </small>
        </Notice>
      )}
      {a.error && (
        <Notice tone="error">
          {a.error}
          {errorCode && (
            <small className="auth-error-code">Support code: {errorCode}</small>
          )}
        </Notice>
      )}
      <details className="sign-in-help">
        <summary>Haven’t received an email?</summary>
        <p>
          Check the address above and search all mail, including Spam/Junk, for
          a confirmation or sign-in email. Allow a few minutes before requesting
          another.
        </p>
        <p>
          If it still doesn’t arrive, tell the trip owner the email address you
          used and the request time. An accepted request does not confirm inbox
          delivery; the owner can check authentication and mail-provider logs.
        </p>
      </details>
    </section>
  );
}
