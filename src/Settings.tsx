import { useState } from "react";
import { appBaseUrl, legalUrl } from "./urls";
import { Monitor, Sun, Moon, Cloud, HardDrive, LogIn } from "lucide-react";
import {
  demo,
  supabase,
  userEmail,
  synchronize,
  pending,
  resolveConflict,
} from "./store";
import type { Mutation } from "./model";
import { Button, Field, Notice, useAsyncAction } from "./ui";
export default function Settings({
  theme,
  setTheme,
  queue,
}: {
  theme: string;
  setTheme: (t: string) => void;
  queue: Mutation[];
}) {
  const [email, setEmail] = useState(""),
    [message, setMessage] = useState(""),
    a = useAsyncAction();
  return (
    <>
      <h3>Make yourself at home</h3>
      <Field label="Appearance">
        <div className="theme-options">
          {[
            ["system", "System", Monitor],
            ["light", "Light", Sun],
            ["dark", "Dark", Moon],
          ].map(([value, label, Icon]) => (
            <button
              key={value as string}
              className={theme === value ? "active" : ""}
              onClick={() => setTheme(value as string)}
            >
              {typeof Icon !== "string" && <Icon size={22} />}
              <span>{label as string}</span>
            </button>
          ))}
        </div>
      </Field>
      <section className="inset">
        <h3>
          {demo ? (
            <>
              <HardDrive size={18} /> Local demo mode
            </>
          ) : (
            <>
              <Cloud size={18} /> Connected mode
            </>
          )}
        </h3>
        <p>
          {demo
            ? "All changes are stored in this browser’s IndexedDB. Sample members are illustrative. No authentication, invitations, Google services, AI, or collaboration is live."
            : "Your edits are saved locally first, then synchronized with the private backend when signed in."}
        </p>
        {!demo &&
          (userEmail ? (
            <>
              <p>Signed in as {userEmail}</p>
              <Button
                onClick={() =>
                  a.run(async () => {
                    await supabase!.auth.signOut();
                    location.reload();
                  })
                }
              >
                Sign out
              </Button>
            </>
          ) : (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                a.run(async () => {
                  const { error } = await supabase!.auth.signInWithOtp({
                    email,
                    options: { emailRedirectTo: appBaseUrl },
                  });
                  if (error) throw error;
                  setMessage("Check your email for your sign-in link.");
                });
              }}
            >
              <Field label="Email">
                <input
                  required
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </Field>
              <Button className="primary" type="submit" disabled={a.busy}>
                <LogIn size={16} />
                Email a sign-in link
              </Button>
            </form>
          ))}
        <p className="small">
          Setup: add Supabase URL and public anon key to .env.local, apply the
          database migration, deploy the travel-services function, and restart.
          Browser Google keys must have origin and API restrictions; server keys
          stay in backend secrets.
        </p>
      </section>
      <h3>Local data & online features</h3>
      <p>
        Previously loaded trips and pending edits are stored on this device.
        Clearing browser storage can remove unsynchronized changes. Export
        expenses before clearing storage.
      </p>
      <p>
        Initial sign-in, live maps, route calculations, AI suggestions,
        exchange-rate requests, and collaboration updates require internet
        access. Offline Google map tiles are not provided.
      </p>
      <Notice>
        Remote access revocation cannot erase data another traveler has already
        downloaded.
      </Notice>
      {queue.length > 0 && (
        <>
          <h3>Pending changes · {queue.length}</h3>
          {queue.map((m) => (
            <div className="conflict" key={m.id}>
              <b>
                {m.entity.data.title || m.entity.kind} · {m.state}
              </b>
              <p>{m.error || "Waiting to synchronize."}</p>
              {m.state === "conflict" && (
                <>
                  <details>
                    <summary>Compare versions</summary>
                    <div className="form-grid">
                      <pre>{JSON.stringify(m.entity.data, null, 2)}</pre>
                      <pre>{JSON.stringify(m.remote?.data, null, 2)}</pre>
                    </div>
                  </details>
                  <div className="button-row">
                    <Button
                      onClick={() => a.run(() => resolveConflict(m, "remote"))}
                    >
                      Keep server version
                    </Button>
                    <Button
                      disabled={m.remote?.deleted}
                      onClick={() => a.run(() => resolveConflict(m, "local"))}
                    >
                      Reapply my version
                    </Button>
                  </div>
                  <small>
                    Financial conflicts require your choice. A remote deletion
                    must be kept; create a new record explicitly if needed.
                  </small>
                </>
              )}
            </div>
          ))}
          <Button onClick={() => a.run(synchronize)}>
            Retry synchronization
          </Button>
        </>
      )}
      {message && <Notice>{message}</Notice>}
      {a.error && <Notice tone="error">{a.error}</Notice>}
      <div className="legal">
        <a
          href={legalUrl(import.meta.env.VITE_PRIVACY_URL, "privacy.html")}
          target="_blank"
          rel="noreferrer"
        >
          Wayfarer privacy
        </a>{" "}
        ·{" "}
        <a
          href={legalUrl(import.meta.env.VITE_TERMS_URL, "terms.html")}
          target="_blank"
          rel="noreferrer"
        >
          Terms of use
        </a>
        <br />
        <a
          href="https://policies.google.com/privacy"
          target="_blank"
          rel="noreferrer"
        >
          Google Privacy Policy
        </a>{" "}
        ·{" "}
        <a
          href="https://maps.google.com/help/terms_maps/"
          target="_blank"
          rel="noreferrer"
        >
          Google Maps Terms
        </a>
        <p>
          Wayfarer privacy: trip data is stored on this device and, when
          configured, in your Supabase project. Google receives place and route
          queries when used. Optional AI receives only destination, dates,
          interests, budget, available time, and activity titles. No booking
          confirmations or private notes are sent.
        </p>
      </div>
    </>
  );
}
