import { useEffect, useSyncExternalStore } from "react";
import type { Entity, Entry } from "./model";
import { api, demo } from "./store";
import {
  transportProblem,
  transportQuery,
  transportMode,
  type TransportQuery,
} from "./transport";
export type TransportEstimate = {
  state: "loading" | "ready" | "error";
  minutes?: number;
  distanceMeters?: number;
  polyline?: string;
  warnings?: string[];
  error?: string;
  source?: string;
  computedAt?: string;
};
const cache = new Map<string, TransportEstimate>();
const pending = new Map<string, Promise<void>>();
const listeners = new Set<() => void>();
let revision = 0;
let generation = 0;
const emit = () => {
  revision++;
  listeners.forEach((listener) => listener());
};
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};
const jobs: (() => void)[] = [];
let running = 0;
function queue<T>(work: () => Promise<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    const run = () => {
      running++;
      work()
        .then(resolve, reject)
        .finally(() => {
          running--;
          jobs.shift()?.();
        });
    };
    if (running < 2) run();
    else jobs.push(run);
  });
}
/** Provider results stay in memory. The same saved inputs reuse one request even after reordering/navigation. */
export function requestTransport(query: TransportQuery, refresh = false) {
  if (pending.has(query.key)) return pending.get(query.key)!;
  if (!refresh && cache.has(query.key)) return Promise.resolve();
  cache.set(query.key, { state: "loading" });
  emit();
  const currentGeneration = generation;
  const request = queue(async () => {
    try {
      if (currentGeneration !== generation) return;
      const response = await api("route", query.tripId, query.input);
      if (currentGeneration !== generation) return;
      if (
        !Number.isFinite(response?.minutes) ||
        response.minutes <= 0 ||
        response.minutes > 10080
      )
        throw Error(
          "No usable route estimate returned. Enter a duration instead.",
        );
      cache.set(query.key, {
        state: "ready",
        minutes: Math.max(1, Math.ceil(response.minutes)),
        distanceMeters:
          Number.isFinite(response.distanceMeters) &&
          response.distanceMeters >= 0
            ? response.distanceMeters
            : undefined,
        polyline: response.polyline,
        warnings: response.warnings || [],
        source: response.source || "Google Routes",
        computedAt: response.computedAt,
      });
    } catch (error) {
      if (currentGeneration !== generation) return;
      cache.set(query.key, {
        state: "error",
        error:
          error instanceof Error
            ? error.message
            : "Travel estimate unavailable. Enter a duration instead.",
      });
    } finally {
      if (currentGeneration === generation) {
        pending.delete(query.key);
        emit();
      }
    }
  });
  pending.set(query.key, request);
  return request;
}
export function clearTransportRouteCache() {
  generation++;
  cache.clear();
  pending.clear();
  emit();
}
export function transportSnapshot(key: string) {
  return cache.get(key);
}
export function useTransportRevision() {
  return useSyncExternalStore(subscribe, () => revision);
}
export function useTransportRoutes(
  entries: Entity<Entry>[],
  context: Entity<Entry>[] = entries,
) {
  useSyncExternalStore(subscribe, () => revision);
  const queries = entries.flatMap((entry) => {
    const query = transportQuery(entry, context);
    return query ? [query] : [];
  });
  const key = JSON.stringify(queries.map((query) => query.key).sort());
  useEffect(() => {
    if (demo) return;
    const calculate = () => {
      if (navigator.onLine)
        queries.forEach((query) => {
          void requestTransport(query);
        });
    };
    const timer = setTimeout(calculate, 500);
    window.addEventListener("online", calculate);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("online", calculate);
    };
  }, [key]);
  const results: Record<string, TransportEstimate> = {};
  for (const entry of entries.filter((e) => e.data.type === "Transportation")) {
    const data = entry.data;
    const problem = transportProblem(data, context);
    if (problem) {
      results[entry.id] = { state: "error", error: problem };
      continue;
    }
    if (data.transport?.manualMinutes !== undefined) {
      results[entry.id] = {
        state: "ready",
        minutes: data.transport.manualMinutes,
        source: "Manual",
      };
      continue;
    }
    const query = transportQuery(entry, context);
    const result = query && cache.get(query.key);
    results[entry.id] =
      result ||
      (!transportMode(data.transport!.method)
        ? {
            state: "error",
            error: "Enter the timetable or booked duration for this method.",
          }
        : demo
          ? {
              state: "error",
              error:
                "Live estimates need a connected account. Enter a duration instead.",
            }
          : !navigator.onLine
            ? {
                state: "error",
                error: "Offline. Enter a duration or refresh when connected.",
              }
            : { state: "loading" });
  }
  return results;
}
