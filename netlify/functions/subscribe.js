// Beatwick "In Rotation" email signup — POST /.netlify/functions/subscribe
// Body: { email: "user@example.com" }
// Real backend: validates server-side, dedupes by SHA-256 hash of the
// normalized email, stores in Netlify Blobs store "beatwick-signups" under
// `signup:<emailHash>`. Never fakes a signup.

import { getStore } from "@netlify/blobs";
import { createHash } from "node:crypto";

const STORE = "beatwick-signups";

// Pragmatic RFC-ish email check: local part, @, domain with a dot, no spaces.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

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

function normalizeEmail(email) {
  return String(email).trim().toLowerCase();
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

  const email = normalizeEmail(body?.email ?? "");
  if (!email || !EMAIL_RE.test(email) || email.length > 254) {
    return jsonResponse({ ok: false, error: "invalid-email" }, 400, req);
  }

  try {
    const store = getStore(STORE);
    const emailHash = createHash("sha256").update(email).digest("hex");
    const key = `signup:${emailHash}`;

    const existing = await store.get(key, { type: "json" });
    if (existing) {
      // Already on the list — treat as success so the form doesn't lie.
      return jsonResponse({ ok: true, already: true }, 200, req);
    }

    await store.setJSON(key, {
      email, // stored normalized for future mailer export
      ts: new Date().toISOString(),
    });

    return jsonResponse({ ok: true }, 200, req);
  } catch (err) {
    return jsonResponse({ ok: false, error: "signup-failed" }, 500, req);
  }
};
