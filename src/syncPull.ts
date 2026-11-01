/** Keyset pagination avoids API row caps and shifting offsets. Never return a partial pull. */
export async function fetchVisibleEntities(client: {
  from: (table: string) => any;
}) {
  const rows: any[] = [];
  let cursor: string | undefined;
  for (let page = 0; page < 1000; page++) {
    let query = client
      .from("entities")
      .select("*")
      .order("id", { ascending: true })
      .limit(500);
    if (cursor) query = query.gt("id", cursor);
    const { data, error } = await query;
    if (error) throw error;
    if (!Array.isArray(data))
      throw Error("Trip download was incomplete. Retry synchronization.");
    if (!data.length) return rows;
    for (const row of data) {
      if (typeof row.id !== "string" || !row.id || (cursor && row.id <= cursor))
        throw Error("Trip download order was invalid. Retry synchronization.");
      cursor = row.id;
      rows.push(row);
    }
    // Continue even for short pages: the project's API cap can be below 500.
  }
  throw Error(
    "Workspace is too large to synchronize safely. Contact the trip owner.",
  );
}
