import { createClient } from "npm:@supabase/supabase-js@2.118.0";
import { corsHeaders } from "npm:@supabase/supabase-js@2.118.0/cors";
import { serviceCors } from "../_shared/cors.ts";
import { googleFailure } from "../_shared/google-error.ts";
import { z } from "npm:zod@4.6.7";
import { readRequestText, redactSecrets } from "../_shared/request.ts";
const allowedOrigins = (
  Deno.env.get("ALLOWED_ORIGIN") || "http://127.0.0.1:5173"
)
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);
const point = z
  .object({
    lat: z.number().min(-90).max(90).optional(),
    lng: z.number().min(-180).max(180).optional(),
    placeId: z.string().max(300).optional(),
  })
  .refine(
    (p) => p.placeId || (p.lat != null && p.lng != null),
    "Coordinates or place ID required",
  );
const modes = z.enum(["DRIVE", "WALK", "BICYCLE", "TRANSIT"]);
function waypoint(p: any) {
  return p.placeId
    ? { placeId: p.placeId }
    : { location: { latLng: { latitude: p.lat, longitude: p.lng } } };
}
async function google(url: string, body: any, mask: string) {
  const key = Deno.env.get("GOOGLE_MAPS_SERVER_KEY");
  if (!key)
    throw Error(
      "Place search needs GOOGLE_MAPS_SERVER_KEY in Supabase Edge Function secrets. Use a separate server key with Places API (New) and Routes API enabled. Manual planning remains available.",
    );
  const r = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": key,
      "X-Goog-FieldMask": mask,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15000),
  });
  const data = await r.json();
  if (!r.ok) throw Error(googleFailure(r.status, data, key));
  return data;
}
Deno.serve(async (req: Request) => {
  const { allowed, headers } = serviceCors(
    req.headers.get("origin"),
    allowedOrigins,
    corsHeaders,
  );
  if (!allowed)
    return new Response(JSON.stringify({ error: "Origin not permitted" }), {
      status: 403,
      headers,
    });
  if (req.method === "OPTIONS") return new Response("ok", { headers });
  let budgetClient: any;
  let leaseId: string | undefined;
  try {
    if (req.method !== "POST")
      return new Response(JSON.stringify({ error: "POST required" }), {
        status: 405,
        headers,
      });
    const auth = req.headers.get("Authorization");
    if (!auth)
      return new Response(
        JSON.stringify({ error: "Authentication required" }),
        { status: 401, headers },
      );
    const sb = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: auth } } },
    );
    const {
      data: { user },
      error: authError,
    } = await sb.auth.getUser();
    if (authError || !user)
      return new Response(JSON.stringify({ error: "Invalid session" }), {
        status: 401,
        headers,
      });
    const raw = await readRequestText(req);
    const body = z
      .object({
        action: z.enum([
          "places",
          "place",
          "route",
          "matrix",
          "ai",
          "rate",
          "nearby",
          "map",
        ]),
        tripId: z.uuid(),
      })
      .passthrough()
      .parse(JSON.parse(raw));
    const { data: membership, error: membershipError } = await sb
      .from("memberships")
      .select("role")
      .eq("trip_id", body.tripId)
      .eq("user_id", user.id)
      .maybeSingle();
    if (membershipError || !membership)
      return new Response(
        JSON.stringify({ error: "Trip membership required" }),
        { status: 403, headers },
      );
    const { data: activeTrip, error: tripError } = await sb
      .from("entities")
      .select("deleted")
      .eq("id", body.tripId)
      .eq("kind", "trip")
      .maybeSingle();
    if (tripError || !activeTrip || activeTrip.deleted)
      return new Response(JSON.stringify({ error: "Trip no longer exists" }), {
        status: 403,
        headers,
      });
    // Unused, unpriced providers stay disabled even for older clients.
    if (body.action === "ai" || body.action === "rate")
      return new Response(
        JSON.stringify({
          error:
            body.action === "ai" && membership.role === "viewer"
              ? "Editor access required"
              : "This optional paid service is disabled. Manual planning is still available.",
        }),
        { status: 403, headers },
      );
    const { data: withinLimit, error: limitError } = await sb.rpc(
      "consume_limit",
      {
        bucket_name: body.action === "map" ? "place" : body.action,
        max_hits: 20,
      },
    );
    if (limitError || !withinLimit)
      return new Response(
        JSON.stringify({ error: "Rate limit reached. Try again in a minute." }),
        { status: 429, headers: { ...headers, "Retry-After": "60" } },
      );
    const serverKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!serverKey)
      return new Response(
        JSON.stringify({
          error:
            "Paid features are unavailable. Manual planning is still available.",
        }),
        { status: 503, headers },
      );
    budgetClient = createClient(Deno.env.get("SUPABASE_URL")!, serverKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const matrixPoints =
      body.action === "matrix"
        ? z
            .array(point.and(z.object({ title: z.string().min(1).max(200) })))
            .min(1)
            .max(12)
            .parse(body.points).length
        : 0;
    const { data: reservation, error: budgetError } = await budgetClient.rpc(
      "reserve_paid_service",
      {
        target_user: user.id,
        action_name: body.action,
        matrix_points: matrixPoints,
      },
    );
    if (
      budgetError ||
      !reservation ||
      (reservation.allowed && !reservation.lease_id)
    )
      return new Response(
        JSON.stringify({
          error:
            "Paid features are unavailable. Manual planning is still available.",
        }),
        { status: 503, headers },
      );
    if (!reservation.allowed)
      return new Response(
        JSON.stringify({
          error: reservation.reason || "Paid features are unavailable.",
        }),
        {
          status: reservation.approval_required ? 403 : 429,
          headers: {
            ...headers,
            ...(reservation.retry_after
              ? { "Retry-After": String(reservation.retry_after) }
              : {}),
          },
        },
      );
    leaseId = reservation.lease_id;
    let result: any;
    if (body.action === "map") result = { allowed: true };
    if (body.action === "places") {
      const query = z.string().min(2).max(200).parse(body.query);
      result = await google(
        "https://places.googleapis.com/v1/places:searchText",
        { textQuery: query, maxResultCount: 5 },
        "places.id,places.displayName,places.formattedAddress,places.attributions",
      );
    }
    if (body.action === "nearby") {
      const input = z
        .object({
          category: z.enum([
            "cafe",
            "restaurant",
            "tourist_attraction",
            "park",
            "museum",
          ]),
          location: z.string().trim().min(2).max(200).optional(),
          anchor: point.optional(),
          radius: z.number().int().min(500).max(10000).default(1500),
        })
        .refine((v) => v.anchor || v.location, "Choose a search location")
        .parse(body);
      let center: { latitude: number; longitude: number } | undefined;
      let centerLabel = input.location || "Selected activity";
      if (input.anchor?.placeId) {
        const key = Deno.env.get("GOOGLE_MAPS_SERVER_KEY");
        if (!key) throw Error("Google services are not configured.");
        const r = await fetch(
          `https://places.googleapis.com/v1/places/${encodeURIComponent(input.anchor.placeId)}`,
          {
            headers: {
              "X-Goog-Api-Key": key,
              "X-Goog-FieldMask": "location,displayName",
            },
            signal: AbortSignal.timeout(15000),
          },
        );
        const detail = await r.json();
        if (!r.ok) throw Error(googleFailure(r.status, detail, key));
        center = detail.location;
        centerLabel = detail.displayName?.text || centerLabel;
      } else if (input.anchor?.lat != null && input.anchor?.lng != null) {
        center = { latitude: input.anchor.lat, longitude: input.anchor.lng };
      } else {
        const resolved = await google(
          "https://places.googleapis.com/v1/places:searchText",
          { textQuery: input.location, maxResultCount: 1 },
          "places.location,places.displayName",
        );
        center = resolved.places?.[0]?.location;
        centerLabel = resolved.places?.[0]?.displayName?.text || centerLabel;
      }
      if (
        !center ||
        !Number.isFinite(center.latitude) ||
        !Number.isFinite(center.longitude)
      )
        throw Error(
          "That location could not be found. Try a city, neighborhood, address or linked activity.",
        );
      const nearby = await google(
        "https://places.googleapis.com/v1/places:searchNearby",
        {
          includedTypes: [input.category],
          maxResultCount: 8,
          rankPreference: "DISTANCE",
          locationRestriction: { circle: { center, radius: input.radius } },
        },
        "places.id,places.displayName,places.formattedAddress,places.attributions",
      );
      result = {
        places: nearby.places || [],
        centerLabel,
        radius: input.radius,
      };
    }
    if (body.action === "place") {
      const placeId = z
          .string()
          .regex(/^[A-Za-z0-9_-]+$/)
          .max(300)
          .parse(body.placeId),
        key = Deno.env.get("GOOGLE_MAPS_SERVER_KEY");
      if (!key) throw Error("Google services are not configured");
      const r = await fetch(
        `https://places.googleapis.com/v1/places/${placeId}`,
        {
          headers: {
            "X-Goog-Api-Key": key,
            "X-Goog-FieldMask":
              "id,location,regularOpeningHours,attributions,googleMapsUri,displayName,formattedAddress",
          },
          signal: AbortSignal.timeout(15000),
        },
      );
      result = await r.json();
      if (!r.ok) throw Error(googleFailure(r.status, result, key));
    }
    if (body.action === "route") {
      const input = z
        .object({
          origin: point,
          destination: point,
          mode: modes,
          departure: z.iso.datetime().optional(),
        })
        .parse(body);
      const params: any = {
        origin: waypoint(input.origin),
        destination: waypoint(input.destination),
        travelMode: input.mode,
        languageCode: "en-US",
      };
      if (input.departure && input.mode === "TRANSIT")
        params.departureTime = input.departure;
      const data = await google(
        "https://routes.googleapis.com/directions/v2:computeRoutes",
        params,
        "routes.duration,routes.distanceMeters,routes.polyline.encodedPolyline,routes.warnings",
      );
      if (!data.routes?.length)
        throw Error(
          "No route available for this transport mode. Try another mode.",
        );
      result = {
        minutes: Math.ceil(parseFloat(data.routes[0].duration) / 60),
        polyline: data.routes[0].polyline?.encodedPolyline,
        warnings: data.routes[0].warnings || [],
        source: "Google Routes",
        computedAt: new Date().toISOString(),
      };
    }
    if (body.action === "matrix") {
      const input = z
        .object({
          points: z
            .array(point.and(z.object({ title: z.string().min(1).max(200) })))
            .min(1)
            .max(12),
          mode: modes,
          departure: z.iso.datetime(),
        })
        .parse(body);
      if (
        new Set(input.points.map((p) => p.title)).size !== input.points.length
      )
        throw Error(
          "Route stop names must be unique. Rename duplicate stops before optimizing.",
        );
      const matrix: Record<string, number> = {};
      for (let offset = 0; offset < input.points.length; offset += 8) {
        const params: any = {
          origins: input.points
            .slice(offset, offset + 8)
            .map((p) => ({ waypoint: waypoint(p) })),
          destinations: input.points.map((p) => ({ waypoint: waypoint(p) })),
          travelMode: input.mode,
        };
        if (input.mode === "TRANSIT") params.departureTime = input.departure;
        const rows = await google(
          "https://routes.googleapis.com/distanceMatrix/v2:computeRouteMatrix",
          params,
          "originIndex,destinationIndex,duration,status,condition",
        );
        for (const row of rows) {
          if (row.condition === "ROUTE_EXISTS" && !row.status?.code)
            matrix[
              `${input.points[offset + row.originIndex].title}|${input.points[row.destinationIndex].title}`
            ] = Math.ceil(parseFloat(row.duration) / 60);
        }
      }
      result = {
        matrix,
        source: "Google Routes",
        computedAt: new Date().toISOString(),
      };
    }
    return new Response(JSON.stringify(result), { headers });
  } catch (e: any) {
    return new Response(
      JSON.stringify({
        error:
          e instanceof z.ZodError
            ? "Invalid request parameters."
            : redactSecrets(e.message || "Service unavailable", [
                Deno.env.get("GOOGLE_MAPS_SERVER_KEY"),
                Deno.env.get("EXCHANGE_RATE_KEY"),
                Deno.env.get("AI_API_KEY"),
                Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"),
              ]),
      }),
      { status: 400, headers },
    );
  } finally {
    if (budgetClient && leaseId) {
      try {
        const { error } = await budgetClient.rpc("release_paid_service", {
          lease_id: leaseId,
        });
        if (error)
          console.warn("Paid request lease will expire automatically.");
      } catch {
        console.warn("Paid request lease will expire automatically.");
      }
    }
  }
});
