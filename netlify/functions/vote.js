// Beatwick fan-vote endpoint — POST /.netlify/functions/vote
// Body: { chart: "global", id: 1..30 }
// Anti-spam: one vote per track per IP per day (hashed IP marker key).
// Counts live in Netlify Blobs store "beatwick-votes" under `votes:<chart>:<id>`.

import { getStore } from "@netlify/blobs";
import { createHash } from "node:crypto";

const ALLOWED_CHARTS = ["global"];
const STORE = "beatwick-votes";

function corsHeaders(req) {
  return {
    "Access-Control-Allow-Origin": req.headers.get("origin") || "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    Vary: "Origin",
  };
}

function jsonResponse(data, status, req) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders(req), "Content-Type": "application/json" },
  });
}

function clientIp(req) {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return (
    req.headers.get("client-ip") ||
    req.headers.get("x-nf-client-connection-ip") ||
    "unknown"
  );
}

export default async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders(req) });
  }
  if (req.method !== "POST") {
    return jsonResponse({ ok: false, error: "method-not-allowed" }, 405, req);
  }

  let body;
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ ok: false, error: "invalid-json" }, 400, req);
  }

  const { chart, id } = body || {};
  const trackId = Number(id);
  const validPayload =
    ALLOWED_CHARTS.includes(chart) &&
    Number.isInteger(trackId) &&
    trackId >= 1 &&
    trackId <= 30;
  if (!validPayload) {
    return jsonResponse({ ok: false, error: "invalid-payload" }, 400, req);
  }

  try {
    const store = getStore(STORE);
    const ipHash = createHash("sha256").update(clientIp(req)).digest("hex");
    const day = new Date().toISOString().slice(0, 10); // yyyy-mm-dd
    const voterKey = `voter:${day}:${ipHash}:${chart}:${trackId}`;
    const countKey = `votes:${chart}:${trackId}`;

    // One vote per track per IP per day.
    if (await store.get(voterKey)) {
      const existing = (await store.get(countKey, { type: "json" })) ?? 0;
      return jsonResponse(
        { ok: false, error: "already-voted", id: trackId, count: Number(existing) || 0 },
        429,
        req
      );
    }

    const current = (await store.get(countKey, { type: "json" })) ?? 0;
    const next = (Number(current) || 0) + 1;
    // Mark the voter BEFORE writing the count so a failed count write
    // can't be retried into a double vote; the marker has a daily scope.
    await store.set(voterKey, "1");
    await store.setJSON(countKey, next);

    return jsonResponse({ ok: true, id: trackId, count: next }, 200, req);
  } catch (err) {
    return jsonResponse({ ok: false, error: "vote-failed" }, 500, req);
  }
};
