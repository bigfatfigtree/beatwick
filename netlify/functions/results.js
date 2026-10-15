// Beatwick vote results — GET /.netlify/functions/results?chart=global
// Returns { ok, chart, votes: { "1": n, ... }, updated }

import { getStore } from "@netlify/blobs";

const ALLOWED_CHARTS = ["global"];
const STORE = "beatwick-votes";

function corsHeaders(req) {
  return {
    "Access-Control-Allow-Origin": req.headers.get("origin") || "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
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

export default async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders(req) });
  }
  if (req.method !== "GET") {
    return jsonResponse({ ok: false, error: "method-not-allowed" }, 405, req);
  }

  const url = new URL(req.url);
  const chart = url.searchParams.get("chart") || "global";
  if (!ALLOWED_CHARTS.includes(chart)) {
    return jsonResponse({ ok: false, error: "invalid-chart" }, 400, req);
  }

  try {
    const store = getStore(STORE);
    const { blobs } = await store.list({ prefix: `votes:${chart}:` });

    const votes = {};
    for (const blob of blobs.slice(0, 60)) {
      const trackId = Number(blob.key.split(":").pop());
      if (!Number.isInteger(trackId) || trackId < 1 || trackId > 30) continue;
      const count = await store.get(blob.key, { type: "json" });
      votes[String(trackId)] = Number(count) || 0;
    }

    return jsonResponse(
      { ok: true, chart, votes, updated: new Date().toISOString() },
      200,
      req
    );
  } catch (err) {
    return jsonResponse({ ok: false, error: "results-failed" }, 500, req);
  }
};
