import { NextRequest, NextResponse } from "next/server";
import { serverDb } from "@/lib/payments/serverdb";
import { incidentsNear } from "@/lib/data";
import { liveIncidentsNear } from "@/lib/ingest/live";
import { normalizeCat } from "@/lib/categories";

// GET /api/search?q=&scope=all|people|jail|crime&lat=&lon=
// Unified crime/law/safety search across three domains:
//   people — public CrimeAI profiles
//   jail   — Miami-Dade jail bookings (official ArcGIS feed, 508k records)
//   crime  — live/seed incidents + community reports by keyword
export const dynamic = "force-dynamic";

const JAIL_URL =
  "https://services.arcgis.com/8Pc9XBTAsYuxx9Ny/arcgis/rest/services/miamidade_jail_data/FeatureServer/0/query";

function titleCase(s: string) {
  return s.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase()).replace(/\s+/g, " ").trim();
}

async function searchPeople(q: string) {
  try {
    const db = serverDb();
    // public accounts only (is_private false/null)
    const { data } = await db
      .from("profiles")
      .select("id, name, handle, photo_url, bio, neighborhood, plan, is_private")
      .or(`name.ilike.%${q}%,handle.ilike.%${q}%`)
      .or("is_private.is.null,is_private.eq.false")
      .limit(20);
    return (data || [])
      .filter((p) => p.handle)
      .map((p) => ({
        id: p.id, name: p.name, handle: p.handle,
        photo: p.photo_url || "", bio: p.bio || "",
        neighborhood: p.neighborhood || "", pro: p.plan === "pro",
      }));
  } catch {
    return [];
  }
}

async function searchJail(q: string) {
  // match names OR charges (e.g. "robbery", "smith")
  // NB: the dataset's 2nd charge column is named "Code2" (not "Charge2").
  const term = q.replace(/'/g, "").toUpperCase();
  const where = `Defendant LIKE '%${term}%' OR Charge1 LIKE '%${term}%' OR Code2 LIKE '%${term}%' OR Charge3 LIKE '%${term}%'`;
  const params = new URLSearchParams({
    where,
    outFields: "Defendant,BookDate,Charge1,Code2,Charge3,City",
    orderByFields: "BookDate DESC",
    resultRecordCount: "24",
    f: "json",
  });
  try {
    const res = await fetch(`${JAIL_URL}?${params}`, { signal: AbortSignal.timeout(15000) });
    if (!res.ok) return [];
    const data = (await res.json()) as any;
    if (data.error) return [];
    return (data.features || []).map((f: any) => {
      const a = f.attributes || {};
      const charges = [a.Charge1, a.Code2, a.Charge3].filter(Boolean).map((c: string) => titleCase(c));
      return {
        name: titleCase(a.Defendant || "Unknown"),
        bookDate: a.BookDate || null,
        charges,
        city: titleCase(a.City || ""),
      };
    });
  } catch {
    return [];
  }
}

async function searchCrime(q: string, lat?: number, lon?: number) {
  const term = q.toLowerCase();
  // incidents near the user (live layer replaces seed/model when present)
  const clat = lat ?? 25.7743, clon = lon ?? -80.1937;
  const live = await liveIncidentsNear(clat, clon, 8);
  const incidents = incidentsNear({ lat: clat, lon: clon, radiusMiles: 8, days: 45, live })
    .filter((i) => i.type.toLowerCase().includes(term) || i.category.includes(normalizeCat(term)) || i.neighborhood.toLowerCase().includes(term))
    .slice(0, 24)
    .map((i) => ({
      type: i.type, category: i.category, neighborhood: i.neighborhood,
      block: i.block, occurredAt: i.occurred_at, severity: i.severity,
      source: i.source_label, verified: i.verified, lat: i.lat, lon: i.lon,
    }));

  // community reports (posts) by keyword
  let reports: any[] = [];
  try {
    const db = serverDb();
    const { data } = await db
      .from("posts")
      .select("id, author, handle, text, category, neighborhood, created_at, lat, lon")
      .eq("kind", "report")
      .ilike("text", `%${q}%`)
      .order("created_at", { ascending: false })
      .limit(16);
    reports = (data || []).map((p) => ({
      id: p.id, author: p.author, handle: p.handle, text: p.text,
      category: normalizeCat(p.category), neighborhood: p.neighborhood || "",
      createdAt: p.created_at,
    }));
  } catch {}

  return { incidents, reports };
}

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const q = (sp.get("q") || "").trim();
  const scope = sp.get("scope") || "all";
  const lat = sp.get("lat") ? parseFloat(sp.get("lat")!) : undefined;
  const lon = sp.get("lon") ? parseFloat(sp.get("lon")!) : undefined;
  if (q.length < 2) return NextResponse.json({ people: [], jail: [], incidents: [], reports: [] });

  const wantPeople = scope === "all" || scope === "people";
  const wantJail = scope === "all" || scope === "jail";
  const wantCrime = scope === "all" || scope === "crime";

  const [people, jail, crime] = await Promise.all([
    wantPeople ? searchPeople(q) : Promise.resolve([]),
    wantJail ? searchJail(q) : Promise.resolve([]),
    wantCrime ? searchCrime(q, lat, lon) : Promise.resolve({ incidents: [], reports: [] }),
  ]);

  return NextResponse.json({
    people,
    jail,
    incidents: (crime as any).incidents || [],
    reports: (crime as any).reports || [],
  });
}
