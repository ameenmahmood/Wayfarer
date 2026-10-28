import { useEffect, useState } from "react";
import { appBaseUrl, appBasePath } from "./urls";
import { Mail, UserPlus, ShieldCheck, Copy, Trash2 } from "lucide-react";
import type { Trip, Entity, Role } from "./model";
import { demo, save, supabase, userId, userEmail, synchronize } from "./store";
import { Button, Field, Notice, useAsyncAction } from "./ui";
export default function Members({
  trip,
  entity,
  role,
}: {
  trip: Trip;
  entity: Entity<Trip>;
  role: Role;
}) {
  const [email, setEmail] = useState(""),
    [inviteRole, setInviteRole] = useState("editor"),
    [invitations, setInvitations] = useState<any[]>([]),
    [members, setMembers] = useState<any[]>([]),
    [link, setLink] = useState(""),
    [token, setToken] = useState(
      new URLSearchParams(location.search).get("invite") || "",
    ),
    [message, setMessage] = useState(""),
    a = useAsyncAction();
  async function refresh() {
    if (!supabase) return;
    const [{ data: inv, error }, { data: mem }] = await Promise.all([
      supabase
        .from("invitations")
        .select("id,email,role,expires_at,revoked,accepted_at")
        .eq("trip_id", entity.id),
      supabase.from("memberships").select("*").eq("trip_id", entity.id),
    ]);
    if (error) throw error;
    setInvitations(inv || []);
    setMembers(mem || []);
  }
  useEffect(() => {
    void a.run(refresh);
  }, [entity.id]);
  const people = demo
    ? trip.people
    : members.map((m) => ({
        id: m.user_id,
        name: trip.people.find((p) => p.id === m.user_id)?.name || m.email,
        role: m.role,
      }));
  return (
    <>
      <div className="content-heading">
        <div>
          <h2>Better with your people</h2>
          <p>Private plans, shared only with the people you invite.</p>
        </div>
        <ShieldCheck size={25} />
      </div>
      {demo && (
        <Notice>
          LOCAL DEMO · travelers below are sample data. Invitations, sign-in and
          collaborative updates are not live. Configure Supabase to enable them.
        </Notice>
      )}
      <div className="two-columns">
        <section className="panel">
          <div className="section-head">
            <h3>Trip members</h3>
            <span className="count">{people.length}</span>
          </div>
          {people.map((p, i) => (
            <div className="member-row" key={p.id}>
              <span className={`avatar a${i % 3}`}>{p.name?.slice(0, 1)}</span>
              <div className="grow">
                <b>{p.name}</b>
                <small>
                  {p.id === userId
                    ? "You"
                    : demo
                      ? "Demo traveler"
                      : "Invited member"}
                </small>
              </div>
              <span className="pill">{p.role}</span>
              {role === "owner" && p.id !== userId && p.role !== "owner" && (
                <>
                  <select
                    aria-label={`Role for ${p.name}`}
                    disabled={demo || a.busy}
                    value={p.role}
                    onChange={(e) =>
                      a.run(async () => {
                        const { error } = await supabase!.rpc("manage_member", {
                          target_trip: entity.id,
                          target_user: p.id,
                          new_role: e.target.value,
                        });
                        if (error) throw error;
                        await refresh();
                      })
                    }
                  >
                    <option value="editor">Editor</option>
                    <option value="viewer">Viewer</option>
                  </select>
                  <Button
                    disabled={demo || a.busy}
                    onClick={() =>
                      a.run(async () => {
                        const { error } = await supabase!.rpc("manage_member", {
                          target_trip: entity.id,
                          target_user: p.id,
                          new_role: null,
                        });
                        if (error) throw error;
                        await refresh();
                      })
                    }
                  >
                    Revoke
                  </Button>
                </>
              )}
            </div>
          ))}
          <div className="role-notes">
            <p>
              <b>Owner</b> manages members, invites, and all plans.
            </p>
            <p>
              <b>Editor</b> can edit the itinerary, expenses, and shared
              packing.
            </p>
            <p>
              <b>Viewer</b> can view shared trip information.
            </p>
          </div>
        </section>
        <div className="stack">
          <section className="panel">
            <UserPlus size={24} />
            <h3>Make room for a friend</h3>
            <p>
              Create an email-bound invitation. Copy the link and share it
              yourself; Wayfarer does not send an invitation email.
            </p>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                a.run(async () => {
                  const { data, error } = await supabase!.rpc(
                    "create_invitation",
                    {
                      target_trip: entity.id,
                      target_email: email,
                      invite_role: inviteRole,
                    },
                  );
                  if (error) throw error;
                  setLink(
                    `${appBaseUrl}?invite=${encodeURIComponent(data.token)}`,
                  );
                  await refresh();
                });
              }}
            >
              <Field label="Friend’s email">
                <input
                  type="email"
                  required
                  disabled={demo || role !== "owner"}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </Field>
              <Field label="Access">
                <select
                  disabled={demo || role !== "owner"}
                  value={inviteRole}
                  onChange={(e) => setInviteRole(e.target.value)}
                >
                  <option value="editor">Editor</option>
                  <option value="viewer">Viewer</option>
                </select>
              </Field>
              <Button
                className="primary"
                type="submit"
                disabled={demo || role !== "owner" || a.busy}
              >
                <Mail size={16} />
                Create private invitation
              </Button>
            </form>
            {link && (
              <div className="inset">
                <input aria-label="Invitation link" readOnly value={link} />
                <Button
                  onClick={() =>
                    a.run(async () => {
                      await navigator.clipboard.writeText(link);
                      setMessage("Invitation link copied.");
                    })
                  }
                >
                  <Copy size={15} />
                  Copy invitation link
                </Button>
              </div>
            )}
          </section>
          <Notice>
            Clearing browser storage can remove unsynchronized changes. Revoking
            access prevents future server access; it cannot erase copies already
            downloaded by someone else.
          </Notice>
        </div>
      </div>
      {role === "owner" && invitations.length > 0 && (
        <section className="panel">
          <h3>Invitations</h3>
          {invitations.map((i) => (
            <div className="expense-row" key={i.id}>
              <div className="grow">
                <b>{i.email}</b>
                <small>
                  {i.role} ·{" "}
                  {i.revoked
                    ? "Revoked"
                    : i.accepted_at
                      ? "Accepted"
                      : new Date(i.expires_at) < new Date()
                        ? "Expired"
                        : "Pending"}{" "}
                  · expires {new Date(i.expires_at).toLocaleDateString()}
                </small>
              </div>
              {!i.revoked && !i.accepted_at && (
                <Button
                  onClick={() =>
                    a.run(async () => {
                      const { error } = await supabase!.rpc(
                        "revoke_invitation",
                        { invitation_id: i.id },
                      );
                      if (error) throw error;
                      await refresh();
                    })
                  }
                >
                  Revoke invitation
                </Button>
              )}
            </div>
          ))}
        </section>
      )}
      {!demo && (
        <section className="panel">
          <h3>Have an invitation?</h3>
          <div className="search-row">
            <input
              aria-label="Invitation token"
              value={token}
              onChange={(e) => setToken(e.target.value)}
            />
            <Button
              disabled={!token || a.busy}
              onClick={() =>
                a.run(async () => {
                  const { error } = await supabase!.rpc("accept_invitation", {
                    invite_token: token,
                  });
                  if (error) throw error;
                  await synchronize();
                  await refresh();
                  setMessage("You joined the trip.");
                  history.replaceState(null, "", appBasePath);
                })
              }
            >
              Join trip
            </Button>
          </div>
          <small>
            Sign in as the email the invitation was issued to (
            {userEmail || "not signed in"}).
          </small>
        </section>
      )}
      {message && <Notice>{message}</Notice>}
      {a.error && <Notice tone="error">{a.error}</Notice>}
    </>
  );
}
