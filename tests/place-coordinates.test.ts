import { it, expect, vi } from "vitest";
import { createCoordinateLookup } from "../src/placeCoordinates";

it("fetches only new place IDs and deduplicates simultaneous lookups", async () => {
  const request = vi.fn(async () => ({
    location: { latitude: 1, longitude: 2 },
  }));
  const lookup = createCoordinateLookup("trip", request);
  await Promise.all([lookup("one"), lookup("one"), lookup("two")]);
  await Promise.all([lookup("one"), lookup("two"), lookup("new")]);
  expect(request).toHaveBeenCalledTimes(3);
  expect(request).toHaveBeenLastCalledWith("place", "trip", {
    placeId: "new",
    coordinatesOnly: true,
  });
});
it("does not cache failed lookups and rechecks the server after five minutes", async () => {
  let now = 1000;
  const clock = vi.spyOn(Date, "now").mockImplementation(() => now);
  try {
    const request = vi
      .fn()
      .mockRejectedValueOnce(Error("offline"))
      .mockResolvedValue({ location: { latitude: 1, longitude: 2 } });
    const lookup = createCoordinateLookup("trip", request);
    await expect(lookup("one")).rejects.toThrow("offline");
    await lookup("one");
    await lookup("one");
    expect(request).toHaveBeenCalledTimes(2);
    now += 5 * 60_000;
    await lookup("one");
    expect(request).toHaveBeenCalledTimes(3);
  } finally {
    clock.mockRestore();
  }
});
