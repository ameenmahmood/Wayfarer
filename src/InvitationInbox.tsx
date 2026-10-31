import { useEffect, useState } from "react";
import { Users, RefreshCw } from "lucide-react";
import { supabase, synchronize, syncError } from "./store";
import { Button, Notice, useAsyncAction } from "./ui";
type Invitation = {
  id: string;
  trip_title: string;
  role: string;
  expires_at: string;
};
export default function InvitationInbox({
  token,
  onJoined,
}: {
  token: string;
  onJoined: (tripId: string) => void | Promise<void>;
}) {
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [joined, setJoined] = useState("");
  const [retry, setRetry] = useState(0);
  const a = useAsyncAction();
  useEffect(() => {
    let active = true;
    async function load() {
      setLoading(true);
      setLoadError("");
      try {
        const { data, error } = await supabase!.rpc("my_trip_invitations");
        if (error) throw error;
        if (active) setInvitations(data || []);
      } catch (e: any) {
        if (active)
          setLoadError(e.message || "Invitations could not be loaded.");
      } finally {
        if (active) setLoading(false);
      }
    }
    void load();
    const online = () => setRetry((n) => n + 1);
    window.addEventListener("online", online);
    const timer = setInterval(online, 30000);
    return () => {
      active = false;
      clearInterval(timer);
      window.removeEventListener("online", online);
    };
  }, [retry]);
  async function join(id?: string) {
    await a.run(async () => {
      const { data, error } = await supabase!.rpc(
        id ? "accept_trip_invitation" : "accept_invitation",
        id ? { invitation_id: id } : { invite_token: token },
      );
      if (error) throw error;
      setJoined(data);
      await finish(data);
    });
  }
  async function finish(id: string) {
    await synchronize(true);
    if (syncError)
      throw Error(
        "You joined, but your trip could not be downloaded yet. Check your connection and retry.",
      );
    setInvitations([]);
    await onJoined(id);
    setJoined("");
    setRetry((n) => n + 1);
  }
  if (!loading && !loadError && !invitations.length && !token && !joined)
    return null;
  return (
    <section className="invitation-inbox" aria-label="Trip invitations">
      <div className="section-head">
        <h2>
          <Users size={20} />
          Trip invitations
        </h2>
        <Button
          disabled={loading || a.busy}
          onClick={() => setRetry((n) => n + 1)}
          aria-label="Refresh invitations"
        >
          <RefreshCw size={16} />
        </Button>
      </div>
      {loading && <p role="status">Checking your invitations…</p>}
      {loadError && (
        <Notice tone="error">
          Couldn’t check invitations: {loadError}{" "}
          <Button onClick={() => setRetry((n) => n + 1)}>
            Retry invitations
          </Button>
        </Notice>
      )}
      {joined ? (
        <div className="invitation-inbox-row">
          <p>Your invitation was accepted. Download the trip to open it.</p>
          <Button
            className="primary"
            disabled={a.busy}
            onClick={() => a.run(() => finish(joined))}
          >
            Open joined trip
          </Button>
        </div>
      ) : (
        invitations.map((i) => (
          <div className="invitation-inbox-row" key={i.id}>
            <div>
              <h3>{i.trip_title}</h3>
              <p>
                You’re invited as an {i.role}. Join to see this private trip.
              </p>
            </div>
            <Button
              className="primary"
              disabled={a.busy}
              onClick={() => join(i.id)}
            >
              Join trip
            </Button>
          </div>
        ))
      )}
      {!joined && !loading && !invitations.length && token && (
        <div className="invitation-inbox-row">
          <p>
            Open the trip invitation from your link. Make sure you’re signed in
            with the invited email.
          </p>
          <Button className="primary" disabled={a.busy} onClick={() => join()}>
            Accept invitation
          </Button>
        </div>
      )}
      {a.error && <Notice tone="error">{a.error}</Notice>}
    </section>
  );
}
