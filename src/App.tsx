import { useEffect, useState, useRef, lazy } from "react";
import { appBasePath } from "./urls";
import {
  Compass,
  Plus,
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
  userEmail,
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
const Itinerary = lazy(() => import("./Itinerary"));
const Budget = lazy(() => import("./Budget"));
const Packing = lazy(() => import("./Packing"));
const Members = lazy(() => import("./Members"));
const Settings = lazy(() => import("./Settings"));
const TripForm = lazy(() =>
  import("./Forms").then((m) => ({ default: m.TripForm })),
);
import {
  Button,
  Modal,
  Notice,
  Empty,
  useAsyncAction,
  ScrollRail,
  lockPageScroll,
  LazyPanel,
} from "./ui";
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
    [overview, setOverview] = useState(false),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [theme, setThemeState] = useState(
      localStorage.getItem("wayfarer-theme") || "system",
    ),
    [settings, setSettings] = useState<
      "appearance" | "account" | "sync" | "privacy" | "connections" | null
    >(null),
    [editingTrip, setEditingTrip] = useState<Entity<Trip> | undefined>(() => {
      try {
        const draft = JSON.parse(
          sessionStorage.getItem("wayfarer-trip-draft") || "null",
        );
        if (
          draft?.kind === "trip" &&
          draft.version === 0 &&
          typeof draft.data?.title === "string" &&
          Array.isArray(draft.data.people)
        )
          return draft;
      } catch {
        /* Ignore an invalid draft. */
      }
      return undefined;
    }),
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
    if (!tid) return;
    localStorage.setItem("wayfarer-trip", tid);
    let active = true;
    const cacheKey = `wayfarer-role:${userId}:${tid}`;
    const cached = localStorage.getItem(cacheKey) as Role | null;
    const pendingOwner = queue.some(
      (m) =>
        m.entityId === tid &&
        m.baseVersion === 0 &&
        m.entity.updatedBy === userId,
    );
    setRole(demo || pendingOwner ? "owner" : cached || "viewer");
    if (!demo && navigator.onLine)
      void supabase!
        .from("memberships")
        .select("role")
        .eq("trip_id", tid)
        .eq("user_id", userId)
        .maybeSingle()
        .then(({ data, error }) => {
          if (!active || error || (!data && pendingOwner)) return;
          const next = data?.role || "viewer";
          localStorage.setItem(cacheKey, next);
          setRole(next);
        });
    return () => {
      active = false;
    };
  }, [tid, status, queue.length]);
  const sectionRef = useRef<HTMLDivElement>(null);
  const firstSection = useRef(true);
  useEffect(() => {
    if (firstSection.current) {
      firstSection.current = false;
      return;
    }
    if (!overview) sectionRef.current?.scrollIntoView({ block: "start" });
    else window.scrollTo({ top: 0 });
  }, [tab, overview, tid]);
  useEffect(() => {
    if (!sidebar) return;
    const unlock = lockPageScroll();
    const opener = document.activeElement as HTMLElement | null;
    document.querySelector<HTMLButtonElement>(".mobile-close")?.focus();
    const escape = (e: KeyboardEvent) => {
      if (e.key === "Escape") setSidebar(false);
      if (e.key === "Tab") {
        const controls = [
          ...document.querySelectorAll<HTMLElement>(
            ".sidebar a, .sidebar button:not(:disabled)",
          ),
        ].filter((el) => el.getClientRects().length);
        const first = controls[0],
          last = controls.at(-1);
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last?.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first?.focus();
        }
      }
    };
    document.addEventListener("keydown", escape);
    return () => {
      unlock();
      document.removeEventListener("keydown", escape);
      opener?.focus();
    };
  }, [sidebar]);
  function openTrip(id: string) {
    setTripId(id);
    setOverview(false);
    setTab("itinerary");
    setSidebar(false);
  }
  function openSettings(section: NonNullable<typeof settings> = "appearance") {
    setSidebar(false);
    setSettings(section);
  }
  function showLibrary() {
    setOverview(true);
    setSidebar(false);
    setSettings(null);
  }

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
    setSidebar(false);
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
            setOverview(true);
            setSidebar(false);
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
        <button className="workspace" onClick={showLibrary}>
          <span className="workspace-icon">A</span>
          <div>
            <b>My travel space</b>
            <small>Private workspace</small>
          </div>
          <ChevronRight size={14} />
        </button>
        <span className="sidebar-label">YOUR SPACE</span>
        <button
          className={"nav-item " + (overview ? "active" : "")}
          onClick={() => {
            setOverview(true);
            setSidebar(false);
          }}
        >
          <LayoutGrid size={18} />
          My trips<span className="count">{trips.length}</span>
        </button>
        <button
          className={"nav-item " + (!overview ? "active" : "")}
          onClick={() => {
            if (tid) openTrip(tid);
            else {
              setOverview(false);
              setSidebar(false);
              setTab("itinerary");
            }
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
              openTrip(t.id);
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
          <button className="nav-item" onClick={() => openSettings()}>
            <SettingsIcon size={17} />
            Settings & account
          </button>
          <button className="profile" onClick={() => openSettings("account")}>
            <span className="avatar a0">A</span>
            <div>
              <b>{demo ? "Local traveler" : "My account"}</b>
              <small>{demo ? "Demo workspace" : "Private workspace"}</small>
            </div>
            <span className="pill tiny">{demo ? "LOCAL" : "PRIVATE"}</span>
          </button>
        </div>
      </aside>
      {sidebar && (
        <div className="sidebar-backdrop" onClick={() => setSidebar(false)} />
      )}
      <div className="main-shell" inert={sidebar}>
        <header className="topbar">
          <button
            className="mobile-menu icon-button"
            aria-label="Open navigation"
            onClick={() => setSidebar(true)}
          >
            <Menu size={21} />
          </button>
          <div className="breadcrumb">
            <button
              onClick={() => {
                setOverview(true);
                setSidebar(false);
              }}
            >
              My trips
            </button>
            <ChevronRight size={14} />
            <b>{trip?.title || "Your next adventure"}</b>
          </div>
          <div className="top-actions">
            <button
              className="sync-indicator"
              onClick={() =>
                openSettings(!demo && !userId ? "account" : "sync")
              }
            >
              {status.includes("Offline") ? (
                <WifiOff size={14} />
              ) : status.includes("Syncing") ? (
                <LoaderCircle size={14} className="spin" />
              ) : status.includes("Sign in") ? (
                <Cloud size={14} />
              ) : (
                <Check size={14} />
              )}
              <span>{status}</span>
              {queue.length > 0 && <b>{queue.length}</b>}
            </button>
            <button
              className="avatar small-avatar"
              aria-label="Open account settings"
              onClick={() => openSettings("account")}
            >
              A
            </button>
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
              <button onClick={() => openSettings("connections")}>
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
                  void a.run(async () => {
                    await synchronize();
                    await refresh();
                  });
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
          ) : overview ? (
            <section className="trip-library">
              <div className="content-heading">
                <div>
                  <h1>My trips</h1>
                  <p>Your private adventures, all in one place.</p>
                </div>
                <Button className="primary" onClick={newTrip}>
                  <Plus size={17} />
                  Create a trip
                </Button>
              </div>
              {!trips.length && (
                <Empty title="No trips yet">
                  {!demo && !userId
                    ? "Sign in to load your private trips, or start drafting a new trip."
                    : "Create a trip to start planning your next adventure."}
                </Empty>
              )}
              {!demo && !userId && (
                <Button onClick={() => openSettings("account")}>
                  Sign in to load trips
                </Button>
              )}
              <div className="trip-grid">
                {trips.map((t) => (
                  <button
                    className="trip-tile"
                    key={t.id}
                    onClick={() => openTrip(t.id)}
                  >
                    <Plane size={24} />
                    <h2>{t.data.title}</h2>
                    <p>{t.data.destinations}</p>
                    <small>
                      {t.data.start} - {t.data.end}
                    </small>
                    <span>
                      Open trip <ChevronRight size={16} />
                    </span>
                  </button>
                ))}
              </div>
            </section>
          ) : !trip ? (
            <div className="welcome">
              <Compass size={42} />
              <h1>Trip dashboard</h1>
              <p>
                {!demo && !userId
                  ? "Sign in to open your private dashboard, or draft a new trip below."
                  : "Choose a trip from My trips, or create one to get started."}
              </p>
              <div className="button-row">
                <Button className="primary" onClick={newTrip}>
                  <Plus size={17} />
                  Create a trip
                </Button>
                <Button onClick={() => openSettings("account")}>Sign in</Button>
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
              <ScrollRail className="tabs" label="Trip sections">
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
              </ScrollRail>
              <div className="tab-content" ref={sectionRef}>
                {!canEdit && (
                  <Notice>
                    You have viewer access. Ask the trip owner for editor access
                    to add or change plans, expenses, and packing items.
                  </Notice>
                )}
                <LazyPanel resetKey={`${tid}:${tab}`}>
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
                      canManageBudget={role === "owner"}
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
                      key={tid}
                      trip={trip}
                      tripId={tid!}
                      items={scoped.filter((e) => e.kind === "packing")}
                      templates={scoped.filter((e) => e.kind === "template")}
                      canEdit={canEdit}
                    />
                  )}{" "}
                  {tab === "members" && (
                    <Members
                      key={tid}
                      trip={trip}
                      entity={tripEntity}
                      role={role}
                    />
                  )}
                </LazyPanel>
              </div>
            </>
          )}
          <footer className="app-footer">
            <span>
              <Compass size={14} /> Made for the journey, and the people in it.
            </span>
            <button onClick={() => openSettings("privacy")}>
              Privacy & offline data
            </button>
          </footer>
        </main>
      </div>
      {settings && (
        <Modal
          title={
            {
              appearance: "Appearance settings",
              account: "Your account",
              sync: "Sync status",
              privacy: "Privacy & offline data",
              connections: "Connections",
            }[settings]
          }
          onClose={() => setSettings(null)}
          wide
        >
          <LazyPanel>
            <Settings
              section={settings}
              theme={theme}
              setTheme={setThemeState}
              queue={queue}
            />
          </LazyPanel>
        </Modal>
      )}
      {editingTrip && (
        <Modal
          title={editingTrip.version ? "Edit your trip" : "Where are we going?"}
          onClose={() => {
            if (!editingTrip.version)
              sessionStorage.removeItem("wayfarer-trip-draft");
            setEditingTrip(undefined);
          }}
        >
          <LazyPanel>
            <TripForm
              entity={editingTrip}
              onDone={() => {
                setTripId(editingTrip.id);
                setEditingTrip(undefined);
                setTab("itinerary");
                setOverview(false);
              }}
            />
          </LazyPanel>
        </Modal>
      )}
    </div>
  );
}
