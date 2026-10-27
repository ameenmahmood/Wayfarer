import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { report } from "../src/money";
const db = new PGlite();
const owner = "11111111-1111-4111-8111-111111111111",
  editor = "22222222-2222-4222-8222-222222222222",
  viewer = "33333333-3333-4333-8333-333333333333",
  stranger = "44444444-4444-4444-8444-444444444444",
  tripId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
async function actor(
  id: string,
  email = id === owner
    ? "owner@example.test"
    : id === editor
      ? "friend@example.test"
      : id === viewer
        ? "viewer@example.test"
        : "outsider@example.test",
) {
  await db.query(
    `select set_config('test.uid',$1,false), set_config('test.email',$2,false)`,
    [id, email],
  );
}
async function change(
  kind: string,
  id: string,
  data: any,
  version = 0,
  deleted = false,
  op = randomUUID(),
) {
  const r = await db.query<any>(
    "select public.apply_change($1,$2,$3,$4,$5,$6::jsonb,$7) as result",
    [op, id, tripId, kind, version, JSON.stringify(data), deleted],
  );
  return r.rows[0].result;
}
async function rpc(sql: string, args: any[] = []) {
  return db.query<any>(sql, args);
}
beforeAll(async () => {
  await db.exec(`create role anon; create role authenticated; create schema auth; create table auth.users(id uuid primary key); insert into auth.users values('${owner}'),('${editor}'),('${viewer}'),('${stranger}'); create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('test.uid',true),'')::uuid$$; create function auth.jwt() returns jsonb language sql stable as $$select jsonb_build_object('email',current_setting('test.email',true))$$; grant usage on schema auth to authenticated; grant execute on all functions in schema auth to authenticated;
 -- Test-only cryptographic stand-ins. Production uses pgcrypto. These tests cover SQL and authorization, not token entropy.
 create function public.gen_random_bytes(n int) returns bytea language sql as $$select decode(md5(random()::text)||md5(random()::text),'hex')$$;
 create function public.digest(v text,algo text) returns bytea language sql immutable as $$select decode(md5(v),'hex')$$; create publication supabase_realtime;`);
  const sql = readFileSync(
    new URL("../supabase/migrations/001_private_trips.sql", import.meta.url),
    "utf8",
  ).replace("create extension if not exists pgcrypto;", "");
  await db.exec(sql);
  await actor(owner);
  await change("trip", tripId, {
    title: "Shared Japan",
    destinations: "Tokyo",
    start: "2027-04-12",
    end: "2027-04-20",
    zone: "Asia/Tokyo",
    currency: "USD",
    budget: 200000,
    categoryBudgets: {},
    people: [],
    description: "",
  });
}, 20000);
afterAll(() => db.close());
describe("actual PostgreSQL permission and sync RPCs", () => {
  it("creates a private owner trip and blocks an outsider", async () => {
    await actor(owner);
    expect(
      (await rpc("select public.trip_role($1) role", [tripId])).rows[0].role,
    ).toBe("owner");
    await actor(stranger);
    await expect(
      change("packing", randomUUID(), {
        title: "Attack",
        quantity: 1,
        personal: false,
      }),
    ).rejects.toThrow("Editor access required");
  });
  it("owner invites editor; rejects wrong email; editor accepts once", async () => {
    await actor(owner);
    const token = (
      await rpc(
        "select public.create_invitation($1,'friend@example.test','editor') r",
        [tripId],
      )
    ).rows[0].r.token;
    await actor(stranger);
    await expect(
      rpc("select public.accept_invitation($1)", [token]),
    ).rejects.toThrow("Invitation is invalid");
    await actor(editor);
    expect(
      (await rpc("select public.accept_invitation($1) t", [token])).rows[0].t,
    ).toBe(tripId);
    await expect(
      rpc("select public.accept_invitation($1)", [token]),
    ).rejects.toThrow("Invitation is invalid");
  });
  it("owner and editor both edit; reconnect retry is idempotent", async () => {
    const id = randomUUID(),
      data = {
        title: "Museum",
        type: "Activity",
        duration: 60,
        zone: "Asia/Tokyo",
        cost: 0,
        link: "",
        date: "2027-04-12",
      };
    await actor(owner);
    const created = await change("entry", id, data);
    expect(created.entity.version).toBe(1);
    await actor(editor);
    const op = randomUUID(),
      queued = { ...data, title: "Offline museum change" };
    const synced = await change("entry", id, queued, 1, false, op),
      retry = await change("entry", id, queued, 1, false, op);
    expect(synced).toEqual(retry);
    expect(
      (await rpc("select version from entities where id=$1", [id])).rows[0]
        .version,
    ).toBe(2);
  });
  it("concurrent financial edits return conflict; deletion cannot resurrect", async () => {
    const id = randomUUID(),
      data = { title: "Camera", quantity: 1, personal: false };
    await actor(owner);
    await change("packing", id, data);
    await actor(editor);
    await change("packing", id, { ...data, quantity: 2 }, 1);
    await actor(owner);
    const conflict = await change("packing", id, { ...data, quantity: 3 }, 1);
    expect(conflict.conflict).toBe(true);
    expect(conflict.entity.data.quantity).toBe(2);
    await change("packing", id, data, 2, true);
    const resurrection = await change("packing", id, data, 3);
    expect(resurrection.conflict).toBe(true);
    expect(resurrection.entity.deleted).toBe(true);
  });
  it("splits itemized expense, detects concurrent edit, settles without spending twice", async () => {
    await actor(editor);
    const id = randomUUID();
    const e = {
      title: "Shared dinner",
      category: "Food",
      date: "2027-04-12",
      notes: "",
      payer: owner,
      currency: "USD",
      total: 12000,
      participants: [owner, editor],
      mode: "equal" as const,
      shares: {},
      items: [
        { title: "Food", amount: 9000, participants: [owner, editor] },
        { title: "Drink", amount: 1000, participants: [editor] },
      ],
      tax: 1000,
      tip: 1000,
      fees: 0,
      extraMode: "proportional" as const,
      rate: { num: 1, den: 1, date: "2027-04-12", source: "Manual" },
    };
    const op = randomUUID();
    await change("expense", id, e, 0, false, op);
    await change("expense", id, e, 0, false, op);
    expect(
      (await rpc("select count(*)::int n from entities where kind='expense'"))
        .rows[0].n,
    ).toBe(1);
    await actor(owner);
    await change("expense", id, { ...e, notes: "Owner reviewed" }, 1);
    await actor(editor);
    expect(
      (
        await change(
          "expense",
          id,
          { ...e, notes: "Simultaneous friend edit" },
          1,
        )
      ).conflict,
    ).toBe(true);
    const r = report([e], [], "USD", [owner, editor]),
      s = r.settlements[0],
      rep = { ...s, date: "2027-04-12", notes: "Paid externally" };
    const repayId = randomUUID(),
      repayOp = randomUUID();
    await change("repayment", repayId, rep, 0, false, repayOp);
    await change("repayment", repayId, rep, 0, false, repayOp);
    const final = report([e], [rep], "USD", [owner, editor]);
    expect(final.spent).toBe(12000);
    expect(final.net).toEqual({ [owner]: 0, [editor]: 0 });
    expect(
      (await rpc("select count(*)::int n from entities where kind='repayment'"))
        .rows[0].n,
    ).toBe(1);
  });
  it("rejects invalid financial payloads on the server", async () => {
    await actor(editor);
    await expect(
      change("expense", randomUUID(), {
        title: "Invalid",
        total: 100,
        tax: 0,
        tip: 0,
        fees: 0,
        mode: "exact",
        extraMode: "equal",
        participants: [owner],
        payer: owner,
        shares: { [owner]: 50 },
        items: [],
        rate: { num: 1, den: 1 },
        currency: "USD",
      }),
    ).rejects.toThrow("Split does not reconcile");
  });
  it("viewer cannot write or invite; raw REST-style writes are denied", async () => {
    await actor(owner);
    const token = (
      await rpc(
        "select public.create_invitation($1,'viewer@example.test','viewer') r",
        [tripId],
      )
    ).rows[0].r.token;
    await actor(viewer);
    await rpc("select public.accept_invitation($1)", [token]);
    await expect(
      change("packing", randomUUID(), {
        title: "No",
        quantity: 1,
        personal: false,
      }),
    ).rejects.toThrow("Editor access required");
    await expect(
      rpc("select public.create_invitation($1,'x@example.test','editor')", [
        tripId,
      ]),
    ).rejects.toThrow("Owner access required");
    await db.exec("set role authenticated");
    await expect(
      rpc("update entities set deleted=true where trip_id=$1", [tripId]),
    ).rejects.toThrow("permission denied");
    await db.exec("reset role");
  });
  it("protects personal checklists from other members and filters reads with RLS", async () => {
    await actor(owner);
    const id = randomUUID();
    await change("packing", id, {
      title: "Private medication",
      quantity: 1,
      personal: true,
      assigned: owner,
    });
    await actor(editor);
    await expect(
      change(
        "packing",
        id,
        { title: "Changed", quantity: 1, personal: false },
        1,
      ),
    ).rejects.toThrow("Personal list access denied");
    await db.exec("set role authenticated");
    expect(
      (await rpc("select * from entities where id=$1", [id])).rows,
    ).toHaveLength(0);
    await db.exec("reset role");
  });
  it("revokes pending invitations and member access including receipt replay", async () => {
    await actor(owner);
    const token = (
      await rpc(
        "select public.create_invitation($1,'outsider@example.test','editor') r",
        [tripId],
      )
    ).rows[0].r.token;
    const inv = (
      await rpc(
        "select id from invitations where email='outsider@example.test'",
      )
    ).rows[0].id;
    await rpc("select public.revoke_invitation($1)", [inv]);
    await actor(stranger);
    await expect(
      rpc("select public.accept_invitation($1)", [token]),
    ).rejects.toThrow("Invitation is invalid");
    await actor(editor);
    const id = randomUUID(),
      op = randomUUID(),
      data = { title: "Bag", quantity: 1, personal: false };
    await change("packing", id, data, 0, false, op);
    await actor(owner);
    await rpc("select public.manage_member($1,$2,null)", [tripId, editor]);
    await actor(editor);
    await expect(change("packing", id, data, 0, false, op)).rejects.toThrow(
      "Editor access required",
    );
    await db.exec("set role authenticated");
    expect(
      (await rpc("select * from entities where trip_id=$1", [tripId])).rows,
    ).toHaveLength(0);
    await db.exec("reset role");
  });
});
