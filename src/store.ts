import { openDB } from "idb";
import { createClient } from "@supabase/supabase-js";
import {
  makeEntity,
  uid,
  type Entity,
  type Mutation,
  type Kind,
} from "./model";
const env = import.meta.env;
export const supabase =
  env.VITE_SUPABASE_URL && env.VITE_SUPABASE_ANON_KEY
    ? createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY)
    : null;
export const demo = !supabase;
const dbPromise = openDB("wayfarer-v2", 1, {
  upgrade(db) {
    db.createObjectStore("entities", { keyPath: "id" });
    db.createObjectStore("mutations", { keyPath: "id" });
    db.createObjectStore("meta");
  },
});
export const events = new EventTarget();
const changed = () => events.dispatchEvent(new Event("change"));
export let syncStatus = "Loading local data…";
export let syncError = "";
export let userId = "local-owner";
export let userEmail = "";
export async function all(): Promise<Entity[]> {
  const db = await dbPromise;
  if (!demo) {
    const {
        data: { session },
      } = await supabase!.auth.getSession(),
      account = await db.get("meta", "account");
    if (!session || (account && account !== session.user.id)) return [];
  }
  return db.getAll("entities");
}
export async function pending(): Promise<Mutation[]> {
  return ((await (await dbPromise).getAll("mutations")) as Mutation[]).sort(
    (a, b) => a.sequence - b.sequence,
  );
}
export async function save(entity: Entity) {
  if (!demo) {
    const {
      data: { session },
    } = await supabase!.auth.getSession();
    if (!session) throw Error("Sign in before editing a connected trip.");
    const account = await (await dbPromise).get("meta", "account");
    if (account && account !== session.user.id)
      throw Error(
        "This browser cache belongs to another account. Use a separate browser profile.",
      );
    userId = session.user.id;
  }
  const db = await dbPromise,
    tx = db.transaction(["entities", "mutations"], "readwrite");
  const stored = (await tx.objectStore("entities").get(entity.id)) as
    Entity | undefined;
  if (stored && stored.version !== entity.version) {
    tx.abort();
    throw Error(
      "This record changed while you were editing. Close and reopen it to review the latest version.",
    );
  }
  const baseVersion = stored?.version || 0;
  const next = {
    ...entity,
    version: baseVersion + 1,
    updatedAt: new Date().toISOString(),
    updatedBy: userId,
  };
  if (!demo) {
    const mutations = (await tx
      .objectStore("mutations")
      .getAll()) as Mutation[];
    if (
      mutations.some((m) => m.entityId === entity.id && m.state === "conflict")
    ) {
      tx.abort();
      throw Error("Resolve this record’s conflict before editing it.");
    }
    const sequence = Math.max(0, ...mutations.map((m) => m.sequence)) + 1;
    // Immutable operations: every retry resends the same payload and identifier.
    await tx.objectStore("mutations").put({
      id: uid(),
      entityId: entity.id,
      tripId: entity.tripId,
      baseVersion,
      sequence,
      entity: next,
      state: "pending",
    } satisfies Mutation);
  }
  await tx.objectStore("entities").put(next);
  await tx.done;
  changed();
  if (!demo) void synchronize();
  else {
    syncStatus = "Saved on this device";
    changed();
  }
  return next;
}
export async function create(kind: Kind, tripId: string, data: any) {
  return save(makeEntity(kind, tripId, data, userId));
}
export async function remove(e: Entity) {
  await save({ ...e, deleted: true });
}
let running = false;
export async function synchronize() {
  if (demo) {
    syncStatus = "Saved on this device";
    changed();
    return;
  }
  if (running) return;
  running = true;
  syncError = "";
  try {
    const {
      data: { session },
    } = await supabase!.auth.getSession();
    if (!session) {
      syncStatus = "Sign in to synchronize";
      return;
    }
    const db = await dbPromise,
      priorUser = await db.get("meta", "account");
    if (priorUser && priorUser !== session.user.id)
      throw Error(
        "This browser cache belongs to another account. Use a separate browser profile to avoid mixing private trip data.",
      );
    await db.put("meta", session.user.id, "account");
    userId = session.user.id;
    userEmail = session.user.email || "";
    if (!navigator.onLine) {
      syncStatus = "Offline · edits queued";
      return;
    }
    syncStatus = "Syncing…";
    changed();
    const queue = await pending(),
      conflicted = new Map(
        queue
          .filter((m) => m.state === "conflict")
          .map((m) => [m.entityId, m.remote]),
      );
    for (const m of queue) {
      if (conflicted.has(m.entityId)) {
        if (m.state !== "conflict")
          await db.put("mutations", {
            ...m,
            state: "conflict",
            remote: conflicted.get(m.entityId),
            error: "A prior edit of this record conflicts.",
          });
        continue;
      }
      const { data, error } = await supabase!.rpc("apply_change", {
        op_id: m.id,
        entity_id: m.entityId,
        trip_id: m.tripId,
        entity_kind: m.entity.kind,
        base_version: m.baseVersion,
        payload: m.entity.data,
        is_deleted: m.entity.deleted,
      });
      if (error) {
        await db.put("mutations", {
          ...m,
          state: "failed",
          error: error.message,
        });
        throw error;
      }
      const tx = db.transaction(["entities", "mutations"], "readwrite");
      if (data.conflict) {
        await tx.objectStore("mutations").put({
          ...m,
          state: "conflict",
          remote: data.entity,
          error: "Another collaborator changed this record.",
        });
        conflicted.set(m.entityId, data.entity);
      } else {
        await tx.objectStore("mutations").delete(m.id);
        const remaining = (await tx
          .objectStore("mutations")
          .getAll()) as Mutation[];
        if (!remaining.some((q) => q.entityId === m.entityId))
          await tx.objectStore("entities").put(fromRemote(data.entity));
      }
      await tx.done;
    }
    const { data, error } = await supabase!.from("entities").select("*");
    if (error) throw error;
    const localPending = await pending(),
      blocked = new Set(localPending.map((m) => m.entityId));
    const tx = db.transaction("entities", "readwrite"),
      remoteIds = new Set<string>();
    for (const e of data || []) {
      remoteIds.add(e.id);
      if (!blocked.has(e.id)) await tx.store.put(fromRemote(e));
    }
    const existing = (await tx.store.getAll()) as Entity[];
    for (const e of existing)
      if (!remoteIds.has(e.id) && !blocked.has(e.id))
        await tx.store.delete(e.id);
    await tx.done;
    const remaining = await pending();
    syncStatus = remaining.some((m) => m.state === "conflict")
      ? "Conflict needs review"
      : remaining.length
        ? `${remaining.length} changes pending`
        : "All changes synced";
  } catch (e: any) {
    syncError = e.message || "Connection failed";
    syncStatus = "Sync failed · retry available";
  } finally {
    running = false;
    changed();
  }
}
function fromRemote(r: any): Entity {
  return {
    id: r.id,
    tripId: r.trip_id,
    kind: r.kind,
    data: r.data,
    version: r.version,
    updatedAt: r.updated_at,
    updatedBy: r.updated_by,
    deleted: r.deleted,
  };
}
export async function resolveConflict(m: Mutation, choice: "remote" | "local") {
  const db = await dbPromise,
    tx = db.transaction(["entities", "mutations"], "readwrite");
  const queue = (await tx.objectStore("mutations").getAll()) as Mutation[],
    current = (await tx.objectStore("entities").get(m.entityId)) as Entity;
  if (choice === "local" && (!m.remote || m.remote.deleted)) {
    tx.abort();
    throw Error(
      "The remote record was deleted. Keep deletion or explicitly duplicate as a new record.",
    );
  }
  for (const q of queue)
    if (q.entityId === m.entityId)
      await tx.objectStore("mutations").delete(q.id);
  if (choice === "remote") {
    if (m.remote) await tx.objectStore("entities").put(fromRemote(m.remote));
    else await tx.objectStore("entities").delete(m.entityId);
  } else {
    const next = { ...current, version: m.remote.version + 1 };
    await tx.objectStore("entities").put(next);
    await tx.objectStore("mutations").put({
      ...m,
      id: uid(),
      baseVersion: m.remote.version,
      entity: next,
      state: "pending",
      error: undefined,
      remote: undefined,
    });
  }
  await tx.done;
  changed();
  void synchronize();
}
let initialization: Promise<void> | undefined;
export function init() {
  return (initialization ??= initialize());
}
async function initialize() {
  const db = await dbPromise;
  if (demo && !(await db.get("meta", "seeded"))) {
    const { seed } = await import("./seed");
    const tx = db.transaction(["entities", "meta"], "readwrite");
    for (const e of seed()) await tx.objectStore("entities").put(e);
    await tx.objectStore("meta").put(true, "seeded");
    await tx.done;
  }
  if (supabase) {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (session) {
      userId = session.user.id;
      userEmail = session.user.email || "";
    } else userId = "";
    supabase.auth.onAuthStateChange((_event, session) => {
      userId = session?.user.id || "";
      userEmail = session?.user.email || "";
      setTimeout(() => void synchronize(), 0);
    });
    supabase
      .channel("trip-changes")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "entities" },
        () => void synchronize(),
      )
      .subscribe();
  }
  await synchronize();
  window.addEventListener("online", () => void synchronize());
  window.addEventListener("offline", () => {
    syncStatus = "Offline · edits saved locally";
    changed();
  });
  if (!demo) setInterval(() => void synchronize(), 30000);
}
export async function api(action: string, tripId: string, body: any = {}) {
  if (!supabase)
    throw Error("Connect Supabase and sign in to use this online service.");
  if (!navigator.onLine) throw Error("This feature needs internet access.");
  const { data, error } = await supabase.functions.invoke("travel-services", {
    body: { action, tripId, ...body },
  });
  if (error) {
    // Supabase wraps non-2xx responses; show the server's recovery instructions.
    let message =
      error.name === "FunctionsFetchError"
        ? "Could not reach the travel service. Check your connection and that ALLOWED_ORIGIN includes this site's origin in Supabase Edge Function secrets."
        : error.message;
    if (error.context instanceof Response) {
      try {
        const result = await error.context.json();
        if (typeof result.error === "string") message = result.error;
        else if (typeof result.message === "string") message = result.message;
      } catch {
        /* Non-JSON gateway response. */
      }
    }
    throw Error(message);
  }
  if (data?.error) throw Error(data.error);
  return data;
}
