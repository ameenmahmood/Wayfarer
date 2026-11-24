import { beforeAll, beforeEach, afterAll, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";

const db = new PGlite();
const owner = "11111111-1111-4111-8111-111111111111";
const friend = "22222222-2222-4222-8222-222222222222";
async function reserve(user = owner, action = "places", points = 0) {
  return (
    await db.query<any>("select public.reserve_paid_service($1,$2,$3) as r", [
      user,
      action,
      points,
    ])
  ).rows[0].r;
}
async function release(id: string) {
  await db.query("select public.release_paid_service($1)", [id]);
}
beforeAll(async () => {
  await db.exec(`create role anon; create role authenticated; create role service_role; create schema auth;
    create table auth.users(id uuid primary key); create schema extensions;
    insert into auth.users values('${owner}'),('${friend}');`);
  await db.exec(
    readFileSync(
      new URL(
        "../supabase/migrations/011_paid_feature_controls.sql",
        import.meta.url,
      ),
      "utf8",
    ),
  );
  await db.exec(
    readFileSync(
      new URL(
        "../supabase/migrations/012_place_coordinate_cache.sql",
        import.meta.url,
      ),
      "utf8",
    ).split("-- Hosted scheduler:")[0],
  );
}, 20000);
beforeEach(async () => {
  await db.exec(`reset role; truncate public.place_coordinate_cache,public.paid_feature_access,public.paid_service_usage,public.paid_service_leases;
    update public.paid_service_settings set enabled=true,monthly_cents=1000,daily_cents=300,user_daily_cents=300;
    insert into public.paid_feature_access(user_id,approved) values('${owner}',true),('${friend}',true);`);
});
afterAll(() => db.close());

it("shares fresh coordinates across approved accounts without spending allowance", async () => {
  await db.query("select public.store_place_coordinates('place-one',1,2)");
  for (const user of [owner, friend]) {
    const result = (
      await db.query<any>(
        "select public.get_place_coordinates($1,'place-one') as r",
        [user],
      )
    ).rows[0].r;
    expect(result).toEqual({
      approved: true,
      location: { latitude: 1, longitude: 2 },
    });
  }
  expect(
    (await db.query("select * from public.paid_service_usage")).rows,
  ).toHaveLength(0);
  const before = (
    await db.query<any>("select expires_at from public.place_coordinate_cache")
  ).rows[0].expires_at;
  await db.query("select public.get_place_coordinates($1,'place-one')", [
    owner,
  ]);
  expect(
    (
      await db.query<any>(
        "select expires_at from public.place_coordinate_cache",
      )
    ).rows[0].expires_at,
  ).toEqual(before);
});
it("ignores expired coordinates and denies revoked accounts even for cache hits", async () => {
  await db.query("select public.store_place_coordinates('place-one',1,2)");
  await db.exec(
    `update public.paid_feature_access set approved=false where user_id='${owner}'`,
  );
  expect(
    (
      await db.query<any>(
        "select public.get_place_coordinates($1,'place-one') as r",
        [owner],
      )
    ).rows[0].r,
  ).toEqual({ approved: false });
  await db.exec(
    "update public.place_coordinate_cache set expires_at=now()-interval '1 second'",
  );
  expect(
    (
      await db.query<any>(
        "select public.get_place_coordinates($1,'place-one') as r",
        [friend],
      )
    ).rows[0].r,
  ).toEqual({ approved: true });
  await db.exec(
    "delete from public.place_coordinate_cache where expires_at<=now()",
  );
  expect(
    (await db.query("select * from public.place_coordinate_cache")).rows,
  ).toHaveLength(0);
});
it("prevents browser clients reading, poisoning or directly calling the coordinate cache", async () => {
  for (const role of ["anon", "authenticated"]) {
    await db.exec(`set role ${role}`);
    for (const sql of [
      "select * from public.place_coordinate_cache",
      "select public.store_place_coordinates('poison',1,2)",
      `select public.get_place_coordinates('${owner}','place-one')`,
    ])
      await expect(db.exec(sql)).rejects.toThrow(/permission denied/);
    await db.exec("reset role");
  }
});

it("requires explicit account approval even for trip owners and map loads", async () => {
  await db.exec("delete from paid_feature_access");
  expect(await reserve()).toMatchObject({
    allowed: false,
    approval_required: true,
  });
  expect(await reserve(owner, "map")).toMatchObject({
    allowed: false,
    approval_required: true,
  });
  expect(
    (await db.query("select * from paid_service_usage")).rows,
  ).toHaveLength(0);
});
it("prevents public clients from self-approval, budget changes and direct reservations", async () => {
  for (const role of ["anon", "authenticated"]) {
    await db.exec(`set role ${role}`);
    for (const sql of [
      `update public.paid_feature_access set approved=true`,
      `update public.paid_service_settings set monthly_cents=1000`,
      `delete from public.paid_service_usage`,
      `select public.reserve_paid_service('${owner}','map',0)`,
      `select public.release_paid_service(gen_random_uuid())`,
    ])
      await expect(db.exec(sql)).rejects.toThrow(/permission denied/);
    await db.exec("reset role");
  }
});
it("allows only service-role reservation RPCs and rejects unpriced services", async () => {
  await db.exec("set role service_role");
  expect(await reserve()).toMatchObject({ allowed: true });
  await expect(reserve(owner, "ai")).rejects.toThrow(/disabled/);
  await expect(reserve(owner, "rate")).rejects.toThrow(/disabled/);
  await expect(reserve(owner, "matrix", 13)).rejects.toThrow(/matrix size/);
});
it("reserves matrix elements and both nearby upstream calls conservatively", async () => {
  await release((await reserve(owner, "matrix", 12)).lease_id);
  await release((await reserve(owner, "nearby")).lease_id);
  const usage = (
    await db.query<any>(
      "select cents from paid_service_usage where scope='global:month'",
    )
  ).rows[0];
  expect(usage.cents).toBe(298);
  expect(await reserve()).toMatchObject({ allowed: false });
});
it("enforces the monthly ceiling across users before any overshoot", async () => {
  await db.exec("update paid_service_settings set monthly_cents=10");
  await release((await reserve()).lease_id);
  await release((await reserve(friend)).lease_id);
  expect(await reserve()).toMatchObject({
    allowed: false,
    reason: expect.stringContaining("monthly"),
  });
  expect(
    (
      await db.query<any>(
        "select cents from paid_service_usage where scope='global:month'",
      )
    ).rows[0].cents,
  ).toBe(10);
});
it("enforces user daily and global daily limits independently", async () => {
  await db.exec(
    "update paid_service_settings set user_daily_cents=5,daily_cents=10",
  );
  await release((await reserve()).lease_id);
  expect(await reserve()).toMatchObject({
    allowed: false,
    reason: expect.stringContaining("daily"),
  });
  await release((await reserve(friend)).lease_id);
  expect(await reserve(friend)).toMatchObject({ allowed: false });
});
it("limits concurrent requests and expires abandoned leases without refunding usage", async () => {
  const first = await reserve();
  await reserve();
  expect(await reserve()).toMatchObject({ allowed: false, retry_after: 5 });
  await release(first.lease_id);
  expect(await reserve()).toMatchObject({ allowed: true });
  await db.exec(
    "update paid_service_leases set expires_at=now()-interval '1 second'",
  );
  expect(await reserve()).toMatchObject({ allowed: true });
  expect(
    (
      await db.query<any>(
        "select cents from paid_service_usage where scope='global:month'",
      )
    ).rows[0].cents,
  ).toBe(20);
});
it("limits requests across action buckets and trips in the same minute", async () => {
  for (let i = 0; i < 12; i++)
    await release((await reserve(owner, i % 2 ? "map" : "places")).lease_id);
  expect(await reserve(owner, "route")).toMatchObject({
    allowed: false,
    reason: expect.stringContaining("Too many"),
  });
  expect(await reserve(friend)).toMatchObject({ allowed: true });
});
it("starts new UTC periods without deleting previous accounting", async () => {
  await db.exec("update paid_service_settings set monthly_cents=5");
  await release((await reserve()).lease_id);
  expect((await reserve()).allowed).toBe(false);
  await db.exec(
    "update paid_service_usage set window_start=window_start-interval '1 year'",
  );
  expect((await reserve()).allowed).toBe(true);
  expect(
    (
      await db.query(
        "select * from paid_service_usage where scope='global:month'",
      )
    ).rows,
  ).toHaveLength(2);
});
it("applies revocation and the kill switch to the next request", async () => {
  await release((await reserve()).lease_id);
  await db.exec(
    `update paid_feature_access set approved=false where user_id='${owner}'`,
  );
  expect(await reserve()).toMatchObject({
    allowed: false,
    approval_required: true,
  });
  await db.exec("update paid_service_settings set enabled=false");
  expect(await reserve(friend)).toMatchObject({
    allowed: false,
    reason: expect.stringContaining("paused"),
  });
});
