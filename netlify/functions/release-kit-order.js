// Beatwick "Release Kits" order endpoint — POST /.netlify/functions/release-kit-order
// Body: { artist, email, ig_handle?, release_date?, tier: "single"|"ep", notes? }
// Real backend: validates server-side and stores each order in the
// Netlify Blobs store "beatwick-release-kits" under `order:<uuid>`.
// Orders are stored with status "invoice-pending" until the founder
// sends a Stripe invoice (manual, within 24 hours) or until the
// Stripe Payment Links are wired and the artist pays at checkout
// (then the founder flips status to "paid" in the dashboard).
//
// HONEST PAYMENT LIMITATION: there is no Stripe secret key in the Netlify
// environment, so this function cannot verify payments server-side and
// there is no Stripe webhook wired up. Do not invent an automatic
// verification mechanism here. The page copy tells artists exactly this:
// no charge happens on this form; an invoice follows within 24 hours.

import { getStore } from "@netlify/blobs";
import { randomUUID } from "node:crypto";
import { createHash } from "node:crypto";

const STORE = "beatwick-release-kits";

// Pragmatic RFC-ish email check: local part, @, domain with a dot, no spaces.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const IG_RE = /^@?[A-Za-z0-9._]{1,30}$/;

const MAX_ARTIST = 120;
const MAX_NOTES = 1500;
const MAX_IG = 40;
const MAX_ORDERS_PER_IP_PER_DAY = 10;

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

function looksLikeDate(s) {
  // Accepts YYYY-MM-DD only; must be a real calendar date.
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(s + "T00:00:00Z");
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
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

  const artist = String(body?.artist ?? "").trim();
  const email = String(body?.email ?? "").trim().toLowerCase();
  const igHandle = String(body?.ig_handle ?? "").trim();
  const releaseDate = String(body?.release_date ?? "").trim();
  const tier = String(body?.tier ?? "").trim().toLowerCase();
  const notes = String(body?.notes ?? "").trim();

  if (!artist || artist.length > MAX_ARTIST) {
    return jsonResponse({ ok: false, error: "invalid-artist" }, 400, req);
  }
  if (!email || !EMAIL_RE.test(email) || email.length > 254) {
    return jsonResponse({ ok: false, error: "invalid-email" }, 400, req);
  }
  if (igHandle && (!IG_RE.test(igHandle) || igHandle.length > MAX_IG)) {
    return jsonResponse({ ok: false, error: "invalid-ig-handle" }, 400, req);
  }
  if (releaseDate && !looksLikeDate(releaseDate)) {
    return jsonResponse({ ok: false, error: "invalid-release-date" }, 400, req);
  }
  if (tier !== "single" && tier !== "ep") {
    return jsonResponse({ ok: false, error: "invalid-tier" }, 400, req);
  }
  if (notes.length > MAX_NOTES) {
    return jsonResponse({ ok: false, error: "invalid-notes" }, 400, req);
  }

  try {
    const store = getStore(STORE);

    // Light anti-spam: cap orders per IP per day (same pattern as vote.js).
    const ipHash = createHash("sha256").update(clientIp(req)).digest("hex");
    const day = new Date().toISOString().slice(0, 10);
    const limitKey = `orderlimit:${day}:${ipHash}`;
    const used = Number((await store.get(limitKey, { type: "json" })) ?? 0);
    if (used >= MAX_ORDERS_PER_IP_PER_DAY) {
      return jsonResponse({ ok: false, error: "rate-limited" }, 429, req);
    }
    await store.setJSON(limitKey, used + 1);

    const id = randomUUID();
    const order = {
      id,
      artist,
      email,
      ig_handle: igHandle,
      release_date: releaseDate,
      tier,
      price_usd: tier === "single" ? 99 : 249,
      notes,
      status: "invoice-pending",
      created_at: new Date().toISOString(),
    };
    await store.setJSON(`order:${id}`, order);

    return jsonResponse({ ok: true, id, tier, status: order.status }, 200, req);
  } catch (err) {
    return jsonResponse({ ok: false, error: "order-failed" }, 500, req);
  }
};
