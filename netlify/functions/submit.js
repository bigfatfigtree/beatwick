// Beatwick "Get Heard" submission endpoint — POST /.netlify/functions/submit
// Body: { artist, city, spotify_url, youtube_url, bio, email, ig_handle?, tier: "standard"|"priority" }
// Real backend: validates server-side and stores each submission in the
// Netlify Blobs store "beatwick-submissions" under `submission:<uuid>`.
// Standard submissions are stored with status "queued"; priority
// submissions with status "payment-pending" until the artist pays via the
// Stripe Payment Link. Never fakes a stored submission.
//
// HONEST PAYMENT LIMITATION: there is no Stripe secret key in the Netlify
// environment, so this function cannot verify payments server-side and
// there is no Stripe webhook wired up. The review flow is manual: the
// founder matches the submission email against payments in the Stripe
// dashboard before reviewing a "payment-pending" submission. Do not invent
// an automatic verification mechanism here.

import { getStore } from "@netlify/blobs";
import { randomUUID } from "node:crypto";
import { createHash } from "node:crypto";

const STORE = "beatwick-submissions";

// Pragmatic RFC-ish email check: local part, @, domain with a dot, no spaces.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const IG_RE = /^@?[A-Za-z0-9._]{1,30}$/;
const SPOTIFY_HOSTS = new Set(["open.spotify.com"]);
const YOUTUBE_HOSTS = new Set([
  "www.youtube.com",
  "youtube.com",
  "m.youtube.com",
  "music.youtube.com",
  "youtu.be",
]);

// The 30 launch cities — must match cities/*.html slugs.
const CITIES = new Set([
  "new-york", "los-angeles", "toronto", "montreal", "nashville", "atlanta",
  "new-orleans", "sao-paulo", "mexico-city", "bogota", "buenos-aires",
  "kingston", "london", "berlin", "paris", "amsterdam", "barcelona",
  "lisbon", "stockholm", "glasgow", "lagos", "johannesburg", "accra",
  "cairo", "tokyo", "seoul", "mumbai", "jakarta", "manila", "melbourne",
]);

const MAX_ARTIST = 120;
const MAX_BIO = 1500;
const MIN_BIO = 10;
const MAX_URL = 500;
const MAX_IG = 40;
const MAX_SUBMISSIONS_PER_IP_PER_DAY = 10;

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

function looksLikeSpotifyTrack(url) {
  try {
    const u = new URL(url);
    return (
      SPOTIFY_HOSTS.has(u.hostname.toLowerCase()) && u.pathname.includes("/track/")
    );
  } catch {
    return false;
  }
}

function looksLikeYouTube(url) {
  try {
    const u = new URL(url);
    const host = u.hostname.toLowerCase();
    if (!YOUTUBE_HOSTS.has(host)) return false;
    if (host === "youtu.be") return u.pathname.length > 1;
    return (
      u.pathname === "/watch" ||
      u.pathname.startsWith("/shorts/") ||
      u.pathname.startsWith("/embed/") ||
      u.pathname.startsWith("/live/")
    );
  } catch {
    return false;
  }
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
  const city = String(body?.city ?? "").trim().toLowerCase();
  const spotifyUrl = String(body?.spotify_url ?? "").trim();
  const youtubeUrl = String(body?.youtube_url ?? "").trim();
  const bio = String(body?.bio ?? "").trim();
  const email = String(body?.email ?? "").trim().toLowerCase();
  const igHandle = String(body?.ig_handle ?? "").trim();
  const tier = String(body?.tier ?? "standard").trim().toLowerCase();

  if (!artist || artist.length > MAX_ARTIST) {
    return jsonResponse({ ok: false, error: "invalid-artist" }, 400, req);
  }
  if (!CITIES.has(city)) {
    return jsonResponse({ ok: false, error: "invalid-city" }, 400, req);
  }
  if (!spotifyUrl || spotifyUrl.length > MAX_URL || !looksLikeSpotifyTrack(spotifyUrl)) {
    return jsonResponse({ ok: false, error: "invalid-spotify-url" }, 400, req);
  }
  if (!youtubeUrl || youtubeUrl.length > MAX_URL || !looksLikeYouTube(youtubeUrl)) {
    return jsonResponse({ ok: false, error: "invalid-youtube-url" }, 400, req);
  }
  if (!bio || bio.length < MIN_BIO || bio.length > MAX_BIO) {
    return jsonResponse({ ok: false, error: "invalid-bio" }, 400, req);
  }
  if (!email || !EMAIL_RE.test(email) || email.length > 254) {
    return jsonResponse({ ok: false, error: "invalid-email" }, 400, req);
  }
  if (igHandle && (!IG_RE.test(igHandle) || igHandle.length > MAX_IG)) {
    return jsonResponse({ ok: false, error: "invalid-ig-handle" }, 400, req);
  }
  if (tier !== "standard" && tier !== "priority") {
    return jsonResponse({ ok: false, error: "invalid-tier" }, 400, req);
  }

  try {
    const store = getStore(STORE);

    // Light anti-spam: cap submissions per IP per day (same pattern as vote.js).
    const ipHash = createHash("sha256").update(clientIp(req)).digest("hex");
    const day = new Date().toISOString().slice(0, 10);
    const limitKey = `submitlimit:${day}:${ipHash}`;
    const used = Number((await store.get(limitKey, { type: "json" })) ?? 0);
    if (used >= MAX_SUBMISSIONS_PER_IP_PER_DAY) {
      return jsonResponse({ ok: false, error: "rate-limited" }, 429, req);
    }
    await store.setJSON(limitKey, used + 1);

    const id = randomUUID();
    const submission = {
      id,
      artist,
      city,
      spotify_url: spotifyUrl,
      youtube_url: youtubeUrl,
      bio,
      email,
      ig_handle: igHandle,
      tier,
      status: tier === "priority" ? "payment-pending" : "queued",
      created_at: new Date().toISOString(),
    };
    await store.setJSON(`submission:${id}`, submission);

    return jsonResponse({ ok: true, id, tier, status: submission.status }, 200, req);
  } catch (err) {
    return jsonResponse({ ok: false, error: "submit-failed" }, 500, req);
  }
};
