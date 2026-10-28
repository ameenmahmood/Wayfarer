import { useEffect, useState } from "react";
import { appBasePath } from "./urls";
import {
  Compass,
  Plus,
  ChevronDown,
  ChevronRight,
  CalendarDays,
  MapPin,
  Wallet,
  CheckSquare,
  Users,
  Settings as SettingsIcon,
  ArrowUpRight,
  Cloud,
  Menu,
  X,
  Check,
  WifiOff,
  RefreshCw,
  Plane,
  Bookmark,
  LayoutGrid,
  MoreHorizontal,
  LoaderCircle,
} from "lucide-react";
import {
  all,
  pending,
  events,
  init,
  demo,
  syncStatus,
  syncError,
  synchronize,
  userId,
  supabase,
  save,
} from "./store";
import {
  days,
  uid,
  makeEntity,
  today,
  type Entity,
  type Trip,
  type Mutation,
  type Role,
} from "./model";
import { report, money } from "./money";
import Itinerary from "./Itinerary";
import Budget from "./Budget";
import Packing from "./Packing";
import Members from "./Members";
import Settings from "./Settings";
import { TripForm } from "./Forms";
import { Button, Modal, Notice, Empty, useAsyncAction } from "./ui";
const tabs = [
  ["itinerary", "Itinerary", CalendarDays],
  ["map", "Map", MapPin],
  ["expenses", "Expenses", Wallet],
  ["packing", "Packing list", CheckSquare],
  ["members", "Members", Users],
] as const;
export default function App() {
  const [records, setRecords] = useState<Entity[]>([]),
    [queue, setQueue] = useState<Mutation[]>([]),
    [tripId, setTripId] = useState(localStorage.getItem("wayfarer-trip") || ""),
    [tab, setTab] = useState("itinerary"),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [theme, setThemeState] = useState(
      localStorage.getItem("wayfarer-theme") || "system",
    ),
    [settings, setSettings] = useState(false),
    [editingTrip, setEditingTrip] = useState<Entity<Trip>>(),
    [sidebar, setSidebar] = useState(false),
    [status, setStatus] = useState("Loading…"),
    [role, setRole] = useState<Role>("viewer"),
    [invite, setInvite] = useState(
      new URLSearchParams(location.search).get("invite") || "",
    ),
    a = useAsyncAction();
  async function refresh() {
    try {
      const [r, q] = await Promise.all([all(), pending()]);
      setRecords(r.filter((e) => !e.deleted));
      setQueue(q);
      setStatus(syncStatus);
      setError(syncError);
    } catch (e: any) {
      setError("Local storage could not be read: " + e.message);
    }
  }
  useEffect(() => {
    const f = () => void refresh();
    events.addEventListener("change", f);
    init()
      .then(refresh)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
    return () => events.removeEventListener("change", f);
  }, []);
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem("wayfarer-theme", theme);
  }, [theme]);
  const trips = records.filter((e) => e.kind === "trip") as Entity<Trip>[],
    tripEntity = trips.find((t) => t.id === tripId) || trips[0],
    trip = tripEntity?.data,
    tid = tripEntity?.id;
  useEffect(() => {
    if (tid) {
      localStorage.setItem("wayfarer-trip", tid);
      if (demo) setRole("owner");
      else
        supabase!
          .from("memberships")
          .select("role")
          .eq("trip_id", tid)
          .eq("user_id", userId)
          .maybeSingle()
          .then(({ data }) => setRole(data?.role || "viewer"));
    }
  }, [tid, status]);
  const scoped = records.filter((e) => e.tripId === tid),
    entries = scoped.filter((e) => e.kind === "entry"),
    expenses = scoped.filter((e) => e.kind === "expense"),
    repayments = scoped.filter((e) => e.kind === "repayment");
  let spent = 0;
  try {
    if (trip)
      spent = report(
        expenses.map((e) => e.data),
        repayments.map((e) => e.data),
        trip.currency,
        trip.people.map((p) => p.id),
      ).spent;
  } catch {}
  const canEdit = role !== "viewer";
  const newTrip = () => {
    if (!demo && !userId) {
      setSettings(true);
      setError("Sign in before creating a connected trip.");
      return;
    }
    const id = uid();
    setEditingTrip(
      makeEntity("trip", id, {
        title: "",
        destinations: "",
        start: today(),
        end: today(),
        zone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        currency: "USD",
        budget: 0,
        categoryBudgets: {},
        people: [{ id: userId || "local-owner", name: "You", role: "owner" }],
        description: "",
      }),
    );
  };
  return (
    <div className="app-shell">
      <aside className={"sidebar " + (sidebar ? "open" : "")}>
        <a
          className="brand"
          href={appBasePath}
          onClick={(e) => {
            e.preventDefault();
            setTab("itinerary");
          }}
        >
          <span className="brand-icon">
            <Compass size={24} />
          </span>
          wayfarer<span className="brand-dot">.</span>
        </a>
        <button
          aria-label="Close navigation"
          className="mobile-close icon-button"
          onClick={() => setSidebar(false)}
        >
          <X size={20} />
        </button>
        <div className="workspace">
          <span className="workspace-icon">A</span>
          <div>
            <b>My travel space</b>
            <small>Private workspace</small>
          </div>
          <ChevronDown size={14} />
        </div>
        <span className="sidebar-label">YOUR SPACE</span>
        <button
          className="nav-item active"
          onClick={() => {
            setTab("itinerary");
            setSidebar(false);
          }}
        >
          <LayoutGrid size={18} />
          My trips<span className="count">{trips.length}</span>
        </button>
        <button
          className="nav-item"
          onClick={() => {
            setTab("itinerary");
            setSidebar(false);
            setTripId(tid || "");
          }}
        >
          <Bookmark size={18} />
          Trip dashboard
        </button>
        <div className="sidebar-title">
          <span className="sidebar-label">YOUR TRIPS</span>
          <button
            aria-label="Create a trip"
            className="icon-button"
            onClick={newTrip}
          >
            <Plus size={16} />
          </button>
        </div>
        {trips.map((t, i) => (
          <button
            key={t.id}
            className={"trip-nav " + (t.id === tid ? "selected" : "")}
            onClick={() => {
              setTripId(t.id);
              setSidebar(false);
            }}
          >
            <span className={"trip-thumb thumb" + i}>
              <Plane size={17} />
            </span>
            <div>
              <b>{t.data.title}</b>
              <small>
                {new Date(t.data.start + "T12:00:00").toLocaleDateString(
                  "en-US",
                  { month: "short", day: "numeric", year: "numeric" },
                )}
              </small>
            </div>
            {t.id === tid && <span className="nav-dot" />}
          </button>
        ))}
        <Button className="new-trip" onClick={newTrip}>
          <Plus size={16} />
          Plan a new trip
        </Button>
        <div className="sidebar-bottom">
          <div className="private-note">
            <span>✧</span>
            <b>
              Good company.
              <br />
              Great adventures.
            </b>
            <p>
              Your plans belong to you
              <br />
              and the people you invite.
            </p>
          </div>
          <button className="nav-item" onClick={() => setSettings(true)}>
            <SettingsIcon size={17} />
            Settings & account
          </button>
          <div className="profile">
            <span className="avatar a0">A</span>
            <div>
              <b>{demo ? "Local traveler" : "My account"}</b>
              <small>{demo ? "Demo workspace" : "Private workspace"}</small>
            </div>
            <span className="pill tiny">{demo ? "LOCAL" : "PRIVATE"}</span>
          </div>
        </div>
      </aside>
      {sidebar && (
        <div className="sidebar-backdrop" onClick={() => setSidebar(false)} />
      )}
      <div className="main-shell">
        <header className="topbar">
          <button
            className="mobile-menu icon-button"
            aria-label="Open navigation"
            onClick={() => setSidebar(true)}
          >
            <Menu size={21} />
          </button>
          <div className="breadcrumb">
            <span>My trips</span>
            <ChevronRight size={14} />
            <b>{trip?.title || "Your next adventure"}</b>
          </div>
          <div className="top-actions">
            <button
              className="sync-indicator"
              onClick={() => setSettings(true)}
            >
              {status.includes("Offline") ? (
                <WifiOff size={14} />
              ) : status.includes("Syncing") ? (
                <LoaderCircle size={14} className="spin" />
              ) : (
                <Check size={14} />
              )}
              <span>{status}</span>
              {queue.length > 0 && <b>{queue.length}</b>}
            </button>
            <span className="avatar small-avatar">A</span>
          </div>
        </header>
        <main>
          {demo && (
            <div className="demo-banner">
              <span className="demo-dot" />
              <b>Local demo</b>
              <span>
                Make it your own. Changes are saved in this browser;
                collaboration and live services require setup.
              </span>
              <button onClick={() => setSettings(true)}>
                Connection settings <ArrowUpRight size={13} />
              </button>
            </div>
          )}
          {(error || a.error) && (
            <Notice tone="error">
              {error || a.error}
              <Button
                onClick={() => {
                  setError("");
                  void synchronize();
                  void refresh();
                }}
              >
                <RefreshCw size={14} />
                Retry
              </Button>
            </Notice>
          )}
          {loading ? (
            <div className="loading">
              <LoaderCircle className="spin" />
              Opening your travel space…
            </div>
          ) : !trip ? (
            <div className="welcome">
              <Compass size={42} />
              <h1>Good trips begin with a little possibility.</h1>
              <p>Create your first private trip and bring your people along.</p>
              <div className="button-row">
                <Button className="primary" onClick={newTrip}>
                  <Plus size={17} />
                  Create a trip
                </Button>
                <Button onClick={() => setSettings(true)}>
                  Sign in & connection settings
                </Button>
              </div>
              {invite && !demo && (
                <div className="panel">
                  <h3>You have a trip invitation</h3>
                  <p>Sign in with the invited email first, then join.</p>
                  <Button
                    onClick={() =>
                      a.run(async () => {
                        const { error } = await supabase!.rpc(
                          "accept_invitation",
                          { invite_token: invite },
                        );
                        if (error) throw error;
                        setInvite("");
                        history.replaceState(null, "", appBasePath);
                        await synchronize();
                      })
                    }
                  >
                    Accept invitation
                  </Button>
                </div>
              )}
            </div>
          ) : (
            <>
              <section className="trip-hero">
                <div className="hero-photo" />
                <div className="hero-overlay" />
                <div className="hero-content">
                  <span className="hero-tag">
                    <span />{" "}
                    {tripEntity.id.startsWith("demo")
                      ? "THE SAMPLE ADVENTURE"
                      : "YOUR NEXT CHAPTER"}
                  </span>
                  <h1>{trip.title}</h1>
                  <p>
                    <MapPin size={16} />
                    {trip.destinations}
                  </p>
                  <div className="hero-bottom">
                    <span>
                      <CalendarDays size={15} />
                      {new Date(trip.start + "T12:00:00").toLocaleDateString(
                        "en-US",
                        { month: "short", day: "numeric" },
                      )}{" "}
                      –{" "}
                      {new Date(trip.end + "T12:00:00").toLocaleDateString(
                        "en-US",
                        { month: "short", day: "numeric", year: "numeric" },
                      )}
                    </span>
                    <span className="hero-divider" />
                    <span>
                      {days(trip.start, trip.end).length} days of possibility
                    </span>
                  </div>
                </div>
                <div className="hero-buttons">
                  {role === "owner" && (
                    <button onClick={() => setEditingTrip(tripEntity)}>
                      Edit trip <MoreHorizontal size={16} />
                    </button>
                  )}
                  <span className="pill hero-private">Invitation only</span>
                </div>
              </section>
              <section className="trip-overview">
                <div className="overview-intro">
                  <span className="eyebrow">THE ADVENTURE AT A GLANCE</span>
                  <p>
                    {trip.description ||
                      "Your plans, places, and people. All in one place."}
                  </p>
                </div>
                <div className="overview-stat">
                  <span className="stat-icon">
                    <MapPin size={19} />
                  </span>
                  <div>
                    <strong>{entries.length}</strong>
                    <small>plans & places</small>
                  </div>
                </div>
                <div className="overview-stat">
                  <span className="stat-icon">
                    <Wallet size={19} />
                  </span>
                  <div>
                    <strong>{money(spent, trip.currency)}</strong>
                    <small>of {money(trip.budget, trip.currency)} budget</small>
                  </div>
                </div>
                <button
                  className="travelers-summary"
                  onClick={() => setTab("members")}
                >
                  <div className="avatar-stack">
                    {trip.people.slice(0, 3).map((p, i) => (
                      <span key={p.id} className={"avatar a" + i}>
                        {p.name.slice(0, 1)}
                      </span>
                    ))}
                  </div>
                  <small>
                    {trip.people.length} travelers <ChevronRight size={12} />
                  </small>
                </button>
              </section>
              <nav className="tabs" aria-label="Trip sections">
                {tabs.map(([id, label, Icon]) => (
                  <button
                    aria-current={tab === id ? "page" : undefined}
                    key={id}
                    onClick={() => setTab(id)}
                    className={tab === id ? "active" : ""}
                  >
                    <Icon size={17} />
                    {label}
                    {id === "members" && <span>{trip.people.length}</span>}
                  </button>
                ))}
                <span className="grow" />
                <span className="trip-role">{role} access</span>
              </nav>
              <div className="tab-content">
                {(tab === "itinerary" || tab === "map") && (
                  <Itinerary
                    key={tid}
                    trip={trip}
                    tripId={tid!}
                    entries={entries}
                    canEdit={canEdit}
                    mapOnly={tab === "map"}
                  />
                )}{" "}
                {tab === "expenses" && (
                  <Budget
                    trip={trip}
                    tripEntity={tripEntity}
                    expenses={expenses}
                    repayments={repayments}
                    entries={entries}
                    canEdit={canEdit}
                  />
                )}{" "}
                {tab === "packing" && (
                  <Packing
                    trip={trip}
                    tripId={tid!}
                    items={scoped.filter((e) => e.kind === "packing")}
                    templates={scoped.filter((e) => e.kind === "template")}
                    canEdit={canEdit}
                  />
                )}{" "}
                {tab === "members" && (
                  <Members trip={trip} entity={tripEntity} role={role} />
                )}
              </div>
            </>
          )}
          <footer className="app-footer">
            <span>
              <Compass size={14} /> Made for the journey, and the people in it.
            </span>
            <button onClick={() => setSettings(true)}>
              Privacy, offline data & connections
            </button>
          </footer>
        </main>
      </div>
      {settings && (
        <Modal
          title="Your travel space"
          onClose={() => setSettings(false)}
          wide
        >
          <Settings theme={theme} setTheme={setThemeState} queue={queue} />
        </Modal>
      )}
      {editingTrip && (
        <Modal
          title={editingTrip.version ? "Edit your trip" : "Where are we going?"}
          onClose={() => setEditingTrip(undefined)}
        >
          <TripForm
            entity={editingTrip}
            onDone={() => {
              setTripId(editingTrip.id);
              setEditingTrip(undefined);
              setTab("itinerary");
            }}
          />
        </Modal>
      )}
    </div>
  );
}
