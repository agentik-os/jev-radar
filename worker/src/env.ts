export interface Env {
  DB: D1Database;
  BUCKET: R2Bucket;
  AI: Ai;
  ASSETS: Fetcher;
  RADAR_PASS: Workflow;
  TYPESAFE_API_KEY: string;   // secret: AGK Intelligence provider key
  ADMIN_TOKEN: string;        // secret: bearer token for /admin/*
  SITE_URL: string;           // canonical origin (workers.dev until the zone move)
  INDEXABLE: string;          // "true" once the site serves on its public hostname
  WHISPER_MODEL: string;
}

export type Mode = "full" | "fast";
export interface PassParams { mode: Mode; trigger: string }

export const now = () => Math.floor(Date.now() / 1000);
export const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

/** Runs fn over items with at most `limit` in flight, preserving order. */
export async function pool<T, R>(items: T[], limit: number, fn: (x: T, i: number) => Promise<R>): Promise<R[]> {
  const out = new Array<R>(items.length);
  let next = 0;
  const worker = async () => { while (next < items.length) { const i = next++; out[i] = await fn(items[i], i); } };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}

export function chunks<T>(xs: T[], n: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < xs.length; i += n) out.push(xs.slice(i, i + n));
  return out;
}
