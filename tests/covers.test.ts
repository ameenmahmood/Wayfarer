import { expect, it } from "vitest";
import { getCover, suggestCovers, covers, coverUrl } from "../src/covers";
it("suggests a curated New York skyline for NYC and full destination names", () => {
  expect(suggestCovers("NYC weekend")[0].id).toBe("nyc");
  expect(suggestCovers("New York City")[0].id).toBe("nyc");
  expect(suggestCovers("Tokyo, Japan")[0].id).toBe("tokyo");
  expect(suggestCovers("Swiss mountains")[0].id).toBe("peaks");
});
it("does not invent matches or match short keywords inside unrelated words", () => {
  expect(suggestCovers("Test trip")).toEqual([]);
  expect(suggestCovers("research conference")).toEqual([]);
  expect(getCover("unknown").id).toBe("tokyo");
  expect(new Set(covers.map((c) => c.id)).size).toBe(covers.length);
  expect(coverUrl(getCover("nyc"))).toMatch(
    /^https:\/\/images.unsplash.com\/photo-/,
  );
});
