// Beatwick "Sponsor a City" lead capture — POST /.netlify/functions/sponsor
// Body: { company, name, email, city, budget_range, message? }
// Real backend: validates server-side, stores each lead in Netlify Blobs
// store "beatwick-sponsors" under `lead:<uuid>` with id, company, name,
// email, city, budget_range, message, created_at. Never fakes a stored lead.

import { getStore } from "@netlify/blobs";
import { randomUUID } from "node:crypto";

const STORE = "beatwick-sponsors";

// Pragmatic RFC-ish email check: local part, @, domain with a dot, no spaces.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

// The 30 city slugs the sponsorship page offers. Keep in sync with sponsor.html.
const CITIES = [
  "new-york", "los-angeles", "toronto", "montreal", "nashville", "atlanta",
  "new-orleans", "sao-paulo", "mexico-city", "bogota", "buenos-aires",
  "kingston", "london", "berlin", "paris", "amsterdam", "barcelona",
  "lisbon", "stockholm", "glasgow", "lagos", "johannesburg", "accra",
  "cairo", "tokyo", "seoul", "mumbai", "jakarta", "manila", "melbourne",
];

const BUDGET_RANGES = [
  "under-250",
  "250-1000",
  "1000-5000",
  "5000-plus",
  "discuss",
];

const CAPS = {
  company: 120,
  name: 120,
  email: 254,
  message: 2000,
};

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

function cleanString(value, cap) {
  const s = String(value ?? "").trim().replace(/\s+/g, " ");
  return s.length > cap ? s.slice(0, cap) : s;
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

  const company = cleanString(body?.company, CAPS.company);
  const name = cleanString(body?.name, CAPS.name);
  const email = String(body?.email ?? "").trim().toLowerCase();
  const city = String(body?.city ?? "").trim().toLowerCase();
  const budgetRange = String(body?.budget_range ?? "").trim().toLowerCase();
  const message = cleanString(body?.message, CAPS.message);

  if (!company) {
    return jsonResponse({ ok: false, error: "missing-company" }, 400, req);
  }
  if (!name) {
    return jsonResponse({ ok: false, error: "missing-name" }, 400, req);
  }
  if (!email || !EMAIL_RE.test(email) || email.length > CAPS.email) {
    return jsonResponse({ ok: false, error: "invalid-email" }, 400, req);
  }
  if (!CITIES.includes(city)) {
    return jsonResponse({ ok: false, error: "invalid-city" }, 400, req);
  }
  if (!BUDGET_RANGES.includes(budgetRange)) {
    return jsonResponse({ ok: false, error: "invalid-budget-range" }, 400, req);
  }

  const lead = {
    id: randomUUID(),
    company,
    name,
    email,
    city,
    budget_range: budgetRange,
    message,
    created_at: new Date().toISOString(),
  };

  try {
    const store = getStore(STORE);
    await store.setJSON(`lead:${lead.id}`, lead);
    return jsonResponse({ ok: true, id: lead.id }, 200, req);
  } catch (err) {
    return jsonResponse({ ok: false, error: "lead-failed" }, 500, req);
  }
};
