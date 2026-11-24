export type PlaceCoordinates = {
  location: { latitude: number; longitude: number };
};

/** Small, in-memory deduplication layer. Durable caching lives on the server. */
export function createCoordinateLookup(
  tripId: string,
  request: (
    action: string,
    tripId: string,
    body: any,
  ) => Promise<PlaceCoordinates>,
) {
  const pending = new Map<
    string,
    { value: Promise<PlaceCoordinates>; until: number }
  >();
  return (placeId: string) => {
    let cached = pending.get(placeId);
    if (!cached || cached.until <= Date.now()) {
      const value = request("place", tripId, {
        placeId,
        coordinatesOnly: true,
      }).catch((error) => {
        pending.delete(placeId);
        throw error;
      });
      cached = { value, until: Date.now() + 5 * 60_000 };
      pending.set(placeId, cached);
    }
    return cached.value;
  };
}
