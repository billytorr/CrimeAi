// "What CrimeAI knows about this user" — the block that makes the assistant
// feel like it knows who it's talking to, injected into the system prompt.
//
// ⚠️ Reads ONLY this user's own data, and is only ever built for that same
// user's request. Nothing here crosses between users. Reading a person's own
// profile and reports to help them is the per-conversation use DATA-GOVERNANCE
// permits by default; it is not training and not shared.
//
// Fails to an empty string — a missing context block just means a less
// personalised answer, never a broken one.

export async function buildUserContext(userId: string): Promise<string> {
  try {
    const { serverDb } = await import("@/lib/payments/serverdb");
    const db = serverDb(true);

    const [{ data: prof }, { data: reports }, { data: guardian }] = await Promise.all([
      db.from("profiles")
        .select("name, handle, neighborhood, address, plan, radius_miles, alert_categories")
        .eq("id", userId).maybeSingle(),
      db.from("posts")
        .select("kind, text, created_at")
        .eq("user_id", userId).eq("kind", "report")
        .order("created_at", { ascending: false }).limit(5),
      db.from("guardian_scores").select("score, tier").eq("user_id", userId).maybeSingle(),
    ]);

    if (!prof) return "";

    const lines: string[] = ["WHAT YOU KNOW ABOUT THIS USER (use it to personalise, never to profile others):"];
    if (prof.name) lines.push(`- Name: ${prof.name}${prof.handle ? ` (@${prof.handle})` : ""}`);
    if (prof.neighborhood) lines.push(`- Home area: ${prof.neighborhood}`);
    if (prof.radius_miles) lines.push(`- Watches a ${prof.radius_miles}-mile radius`);
    if (Array.isArray(prof.alert_categories) && prof.alert_categories.length) {
      lines.push(`- Most concerned about: ${prof.alert_categories.join(", ")}`);
    }
    lines.push(`- Plan: ${prof.plan === "pro" ? "Protector (paid)" : "Free"}`);
    if (guardian?.tier) lines.push(`- Guardian rank: ${guardian.tier} (score ${guardian.score})`);
    if (reports?.length) {
      lines.push(`- Has filed ${reports.length} recent report(s), most recent: "${String(reports[0].text || "").slice(0, 80)}"`);
    }
    return lines.join("\n");
  } catch {
    return "";
  }
}
