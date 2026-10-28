export type CoverChoice = { id: string; position: number };
export type CoverPreset = {
  id: string;
  name: string;
  category: string;
  photo: string;
  keywords: string[];
  gradient: string;
};
export const covers: CoverPreset[] = [
  {
    id: "tokyo",
    name: "Tokyo streets",
    category: "Cities",
    photo: "1540959733332-eab4deabeeaf",
    keywords: ["tokyo", "japan", "osaka", "kyoto"],
    gradient: "linear-gradient(120deg,#224e52,#754e62)",
  },
  {
    id: "nyc",
    name: "New York skyline",
    category: "Cities",
    photo: "1485871981521-5b1fd3805eee",
    keywords: ["nyc", "new york", "manhattan", "brooklyn"],
    gradient: "linear-gradient(120deg,#233957,#b57c59)",
  },
  {
    id: "paris",
    name: "Paris by the Seine",
    category: "Cities",
    photo: "1499856871958-5b9627545d1a",
    keywords: ["paris", "france"],
    gradient: "linear-gradient(120deg,#425c73,#bc9a80)",
  },
  {
    id: "london",
    name: "London by the river",
    category: "Cities",
    photo: "1513635269975-59663e0ac1ad",
    keywords: ["london", "england", "united kingdom"],
    gradient: "linear-gradient(120deg,#365264,#ae9687)",
  },
  {
    id: "peaks",
    name: "Mountain peaks",
    category: "Nature",
    photo: "1464822759023-fed622ff2c3b",
    keywords: [
      "mountain",
      "mountains",
      "alps",
      "swiss",
      "switzerland",
      "hiking",
      "colorado",
      "rockies",
    ],
    gradient: "linear-gradient(120deg,#3d5360,#91a9b2)",
  },
  {
    id: "alpine",
    name: "Alpine escape",
    category: "Nature",
    photo: "1454496522488-7a8e488e8606",
    keywords: ["alpine", "nepal", "himalaya", "trek", "snow", "ski"],
    gradient: "linear-gradient(120deg,#273f56,#9caeaf)",
  },
  {
    id: "coast",
    name: "Ocean waves",
    category: "Nature",
    photo: "1500375592092-40eb2168fd21",
    keywords: [
      "beach",
      "coast",
      "ocean",
      "sea",
      "hawaii",
      "surf",
      "island",
      "maldives",
    ],
    gradient: "linear-gradient(120deg,#15586b,#79b9af)",
  },
  {
    id: "forest",
    name: "Quiet forest",
    category: "Nature",
    photo: "1448375240586-882707db888b",
    keywords: ["forest", "woods", "camping", "nature", "oregon", "redwoods"],
    gradient: "linear-gradient(120deg,#183c32,#719277)",
  },
  {
    id: "desert",
    name: "Desert horizons",
    category: "Nature",
    photo: "1509316785289-025f5b846b35",
    keywords: ["desert", "dunes", "sahara", "morocco", "dubai", "arizona"],
    gradient: "linear-gradient(120deg,#77523d,#d3ad73)",
  },
];
export function getCover(id?: string) {
  return covers.find((c) => c.id === id) || covers[0];
}
export function coverUrl(cover: CoverPreset, width = 1600) {
  return `https://images.unsplash.com/photo-${cover.photo}?auto=format&fit=crop&w=${width}&q=80`;
}
export function suggestCovers(text: string) {
  const words = text
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ");
  const padded = ` ${words} `;
  return covers
    .map((c) => ({
      cover: c,
      score: c.keywords.filter((k) => padded.includes(` ${k} `)).length,
    }))
    .filter((c) => c.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((c) => c.cover);
}
