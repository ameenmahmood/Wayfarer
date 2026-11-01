import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";

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
  ).replace(
    "create extension if not exists pgcrypto with schema extensions;",
    "",
  );
  await db.exec(sql);
  await db.exec(
    readFileSync(
      new URL("../supabase/migrations/002_delete_trips.sql", import.meta.url),
      "utf8",
    ),
  );
  await db.exec(
    readFileSync(
      new URL(
        "../supabase/migrations/003_missing_conflict_entity.sql",
        import.meta.url,
      ),
      "utf8",
    ),
  );
  await db.exec(
    readFileSync(
      new URL(
        "../supabase/migrations/004_invitation_inbox.sql",
        import.meta.url,
      ),
      "utf8",
    ),
  );
  await db.exec(
    readFileSync(
      new URL(
        "../supabase/migrations/005_internal_validation_helpers.sql",
        import.meta.url,
      ),
      "utf8",
    ),
  );
  await db.exec(
    readFileSync(
      new URL("../supabase/migrations/006_trip_ideas.sql", import.meta.url),
      "utf8",
    ),
  );
  await db.exec(
    readFileSync(
      new URL(
        "../supabase/migrations/007_backend_audit_hardening.sql",
        import.meta.url,
      ),
      "utf8",
    ),
  );
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

async function workspace() {
  await actor(owner);
  const t = randomUUID();
  const write = async (
    kind: string,
    id: string,
    data: any,
    version: number | null = 0,
    deleted = false,
  ) =>
    (
      await rpc("select public.apply_change($1,$2,$3,$4,$5,$6::jsonb,$7) r", [
        randomUUID(),
        id,
        t,
        kind,
        version,
        JSON.stringify(data),
        deleted,
      ])
    ).rows[0].r;
  await write("trip", t, {
    title: "Audit trip",
    destinations: "Tokyo",
    start: "2027-04-12",
    end: "2027-04-20",
    zone: "Asia/Tokyo",
    currency: "USD",
    budget: 0,
    categoryBudgets: {},
    people: [],
  });
  return { t, write };
}
function expense() {
  return {
    title: "Dinner",
    category: "Food",
    date: "2027-04-12",
    notes: "",
    payer: owner,
    currency: "USD",
    total: 1000,
    participants: [owner],
    mode: "equal",
    shares: {},
    items: [],
    tax: 0,
    tip: 0,
    fees: 0,
    extraMode: "equal",
    rate: { num: 1, den: 1, date: "2027-04-12", source: "Manual" },
  };
}
it("rejects a null optimistic version instead of overwriting a newer record", async () => {
  const { write } = await workspace(),
    id = randomUUID();
  await write("packing", id, { title: "Bag", quantity: 1, personal: false });
  await expect(
    write(
      "packing",
      id,
      { title: "Lost update", quantity: 1, personal: false },
      null,
    ),
  ).rejects.toThrow();
});
it.each([undefined, null, []])(
  "rejects missing/null/empty expense participants: %s",
  async (participants) => {
    const { write } = await workspace();
    await expect(
      write("expense", randomUUID(), { ...expense(), participants }),
    ).rejects.toThrow();
  },
);
it.each([undefined, null])(
  "rejects itemized expenses without item participants: %s",
  async (participants) => {
    const { write } = await workspace();
    await expect(
      write("expense", randomUUID(), {
        ...expense(),
        items: [{ title: "Food", amount: 1000, participants }],
      }),
    ).rejects.toThrow();
  },
);
it("validates snapshot metadata, category budgets and numeric JSON types", async () => {
  const { t, write } = await workspace();
  await expect(
    write("expense", randomUUID(), { ...expense(), rate: { num: 1, den: 1 } }),
  ).rejects.toThrow();
  await expect(
    write("expense", randomUUID(), { ...expense(), total: "1000" }),
  ).rejects.toThrow();
  await expect(
    write("entry", randomUUID(), {
      title: "Missing duration",
      zone: "Asia/Tokyo",
      cost: 0,
    }),
  ).rejects.toThrow();
  const trip = (await rpc("select data from entities where id=$1", [t])).rows[0]
    .data;
  await expect(
    write("trip", t, { ...trip, categoryBudgets: { Food: -100 } }, 1),
  ).rejects.toThrow();
});
it("prevents creating a second trip record under an existing trip identity", async () => {
  const { t, write } = await workspace();
  const trip = (await rpc("select data from entities where id=$1", [t])).rows[0]
    .data;
  await expect(write("trip", randomUUID(), trip)).rejects.toThrow();
});
it("limits rate buckets to supported actions and handles saturation without unbounded keys", async () => {
  await actor(owner);
  await expect(
    rpc("select public.consume_limit('arbitrary-bucket',999999)"),
  ).rejects.toThrow();
  expect(
    (await rpc("select public.consume_limit('ai',999999) ok")).rows[0].ok,
  ).toBe(true);
  for (let i = 0; i < 3; i++)
    await rpc("select public.consume_limit('ai',999999)");
  expect(
    (await rpc("select public.consume_limit('ai',999999) ok")).rows[0].ok,
  ).toBe(false);
});

it("revoking a member also invalidates unused invitations issued to that account", async () => {
  const { t } = await workspace();
  const invite = async () =>
    (
      await rpc(
        "select public.create_invitation($1,'friend@example.test','editor') r",
        [t],
      )
    ).rows[0].r.token;
  const first = await invite(),
    spare = await invite();
  await actor(editor);
  await rpc("select public.accept_invitation($1)", [first]);
  await actor(owner);
  await rpc("select public.manage_member($1,$2,null)", [t, editor]);
  await actor(editor);
  await expect(
    rpc("select public.accept_invitation($1)", [spare]),
  ).rejects.toThrow("revoked");
  expect(
    (await rpc("select public.trip_role($1) r", [t])).rows[0].r,
  ).toBeNull();
});
it("deletion cannot carry an oversized payload and helper functions stay private", async () => {
  const { write } = await workspace(),
    id = randomUUID();
  await write("packing", id, { title: "Bag", quantity: 1, personal: false });
  await expect(
    write("packing", id, { title: "Bag", notes: "x".repeat(66000) }, 1, true),
  ).rejects.toThrow("oversized");
  await db.exec("set role authenticated");
  try {
    await expect(
      rpc("select public.validate_payload('packing','{}',null)"),
    ).rejects.toThrow("permission denied");
  } finally {
    await db.exec("reset role");
  }
});
