import { beforeAll, afterAll, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync, readdirSync } from "node:fs";
import { randomUUID } from "node:crypto";
const db = new PGlite();
const owner = "11111111-1111-4111-8111-111111111111",
  friend = "22222222-2222-4222-8222-222222222222",
  stranger = "33333333-3333-4333-8333-333333333333",
  trip = randomUUID(),
  legacy = randomUUID();
async function actor(id: string) {
  await db.query(
    "select set_config('test.uid',$1,false),set_config('test.email',$2,false)",
    [id, id + "@example.test"],
  );
}
const entry = (title: string) => ({
  title,
  type: "Activity",
  date: "2027-04-12",
  endDate: "2027-04-12",
  start: "09:00",
  end: "",
  duration: 60,
  zone: "America/New_York",
  address: "",
  notes: "",
  link: "",
  reservation: "",
  cost: 0,
  currency: "USD",
  fixed: false,
  order: 0,
});
async function change(id: string, data: any, version = 0, kind = "entry") {
  return (
    await db.query<any>(
      "select public.apply_change($1,$2,$3,$4,$5,$6::jsonb,false) as result",
      [randomUUID(), id, trip, kind, version, JSON.stringify(data)],
    )
  ).rows[0].result;
}
async function asAuthenticated(id: string, action: () => Promise<any>) {
  await actor(id);
  await db.exec("set role authenticated");
  try {
    return await action();
  } finally {
    await db.exec("reset role");
  }
}
beforeAll(async () => {
  await db.exec(`create role anon; create role authenticated; create schema auth; create table auth.users(id uuid primary key, email text, email_confirmed_at timestamptz);
 insert into auth.users values ('${owner}','${owner}@example.test',now()),('${friend}','${friend}@example.test',now()),('${stranger}','${stranger}@example.test',now());
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('test.uid',true),'')::uuid$$;
 create function auth.jwt() returns jsonb language sql stable as $$select jsonb_build_object('email',current_setting('test.email',true))$$;
 grant usage on schema auth to authenticated; grant execute on all functions in schema auth to authenticated;
 create function public.gen_random_bytes(n int) returns bytea language sql as $$select decode(md5(random()::text)||md5(random()::text),'hex')$$;
 create function public.digest(v text,algo text) returns bytea language sql immutable as $$select decode(md5(v),'hex')$$; create publication supabase_realtime;`);
  const migrations = new URL("../supabase/migrations/", import.meta.url);
  for (const file of readdirSync(migrations)
    .filter((x) => x.endsWith(".sql") && !x.startsWith("008"))
    .sort())
    await db.exec(
      readFileSync(new URL(file, migrations), "utf8").replace(
        "create extension if not exists pgcrypto with schema extensions;",
        "",
      ),
    );
  await actor(owner);
  await change(
    trip,
    {
      title: "Private trip",
      destinations: "NYC",
      start: "2027-04-12",
      end: "2027-04-13",
      zone: "America/New_York",
      currency: "USD",
      budget: 0,
      categoryBudgets: {},
      people: [],
      description: "",
    },
    0,
    "trip",
  );
  await change(legacy, entry("Old activity"));
  await db.exec(
    readFileSync(
      new URL("008_display_names_and_creators.sql", migrations),
      "utf8",
    ),
  );
  await db.query(
    "insert into public.memberships values($1,$2,'friend@example.test','editor')",
    [trip, friend],
  );
}, 20000);
afterAll(() => db.close());
it("normalizes a name and links it only to the authenticated user", async () => {
  const result = await asAuthenticated(owner, () =>
    db.query<any>(
      "select public.set_display_name('  Ameen   Mahmood  ') as profile",
    ),
  );
  expect(result.rows[0].profile).toEqual({
    user_id: owner,
    display_name: "Ameen Mahmood",
  });
  await asAuthenticated(friend, () =>
    db.query("select public.set_display_name('Josiah')"),
  );
  expect(
    (
      await db.query<any>(
        "select display_name from profiles where user_id=$1",
        [owner],
      )
    ).rows[0].display_name,
  ).toBe("Ameen Mahmood");
});
it("rejects empty, email, control, and oversized display names", async () => {
  for (const name of ["  ", "friend@example.test", "bad\nname", "x".repeat(61)])
    await expect(
      asAuthenticated(owner, () =>
        db.query("select public.set_display_name($1)", [name]),
      ),
    ).rejects.toThrow();
});
it("enforces profile visibility and denies direct updates", async () => {
  expect(
    (
      await asAuthenticated(friend, () =>
        db.query("select * from profiles where user_id=$1", [owner]),
      )
    ).rows,
  ).toHaveLength(1);
  expect(
    (await asAuthenticated(stranger, () => db.query("select * from profiles")))
      .rows,
  ).toHaveLength(0);
  await expect(
    asAuthenticated(friend, () =>
      db.query("update profiles set display_name='Spoof' where user_id=$1", [
        owner,
      ]),
    ),
  ).rejects.toThrow();
  await db.exec("set role anon");
  try {
    await expect(
      db.query("select public.set_display_name('Nope')"),
    ).rejects.toThrow();
  } finally {
    await db.exec("reset role");
  }
});
it("stamps the original creator on the server and preserves it across another member's edit", async () => {
  await actor(owner);
  const id = randomUUID();
  const first = await change(id, {
    ...entry("New activity"),
    createdBy: friend,
  });
  expect(first.entity.created_by).toBe(owner);
  expect(first.entity.created_at).toBeTruthy();
  await actor(friend);
  const updated = await change(id, entry("Edited activity"), 1);
  expect(updated.entity.created_by).toBe(owner);
  expect(updated.entity.updated_by).toBe(friend);
  expect(updated.entity.created_at).toBe(first.entity.created_at);
  await db.query("update entities set created_by=$1 where id=$2", [friend, id]);
  expect(
    (await db.query<any>("select created_by from entities where id=$1", [id]))
      .rows[0].created_by,
  ).toBe(owner);
});
it("does not invent attribution for historical activities", async () => {
  expect(
    (
      await db.query<any>("select created_by from entities where id=$1", [
        legacy,
      ])
    ).rows[0].created_by,
  ).toBeNull();
  await actor(friend);
  const result = await change(legacy, entry("Old activity edited"), 1);
  expect(result.entity.created_by).toBeNull();
  expect(result.entity.updated_by).toBe(friend);
});
it("name changes leave trip versions and membership payloads untouched", async () => {
  const before = (
    await db.query<any>("select data,version from entities where id=$1", [trip])
  ).rows[0];
  await asAuthenticated(owner, () =>
    db.query("select public.set_display_name('Ameen')"),
  );
  expect(
    (
      await db.query<any>("select data,version from entities where id=$1", [
        trip,
      ])
    ).rows[0],
  ).toEqual(before);
});

it("allows a new account to set a name before joining a trip without making it public", async () => {
  await asAuthenticated(stranger, () =>
    db.query("select public.set_display_name('New traveler')"),
  );
  expect(
    (
      await asAuthenticated(owner, () =>
        db.query("select * from profiles where user_id=$1", [stranger]),
      )
    ).rows,
  ).toHaveLength(0);
  expect(
    (await asAuthenticated(stranger, () => db.query("select * from profiles")))
      .rows,
  ).toHaveLength(1);
});
it("revoked members lose profile access but their previous attribution remains readable to current members", async () => {
  await db.query("delete from memberships where trip_id=$1 and user_id=$2", [
    trip,
    friend,
  ]);
  expect(
    (
      await asAuthenticated(friend, () =>
        db.query("select * from profiles where user_id=$1", [owner]),
      )
    ).rows,
  ).toHaveLength(0);
  expect(
    (
      await asAuthenticated(owner, () =>
        db.query("select * from profiles where user_id=$1", [friend]),
      )
    ).rows,
  ).toHaveLength(1);
});
