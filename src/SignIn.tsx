import { useRef, useState } from "react";
import { appBaseUrl } from "./urls";
import { supabase } from "./store";
import { Button, Field, Notice, useAsyncAction } from "./ui";

/** Also works inside the trip form without nesting HTML forms. */
export default function SignIn({
  purpose = "Open your private trips and collaborate with invited friends.",
}: {
  purpose?: string;
}) {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const a = useAsyncAction();
  function send() {
    if (!input.current?.reportValidity()) return;
    void a.run(async () => {
      const { error } = await supabase!.auth.signInWithOtp({
        email: email.trim(),
        options: { emailRedirectTo: appBaseUrl },
      });
      if (error) throw error;
      setSent(true);
    });
  }
  return (
    <section className="inset sign-in-panel">
      <h3>Sign in with email</h3>
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
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              send();
            }
          }}
        />
      </Field>
      <Button className="primary" disabled={a.busy} onClick={send}>
        {a.busy
          ? "Sending link..."
          : sent
            ? "Send another sign-in link"
            : "Email a sign-in link"}
      </Button>
      {sent && (
        <Notice>
          Check your email. Open the newest sign-in link in this browser. If you
          have a trip draft, open the link in this same tab to return to it.
        </Notice>
      )}
      {a.error && <Notice tone="error">{a.error}</Notice>}
    </section>
  );
}
