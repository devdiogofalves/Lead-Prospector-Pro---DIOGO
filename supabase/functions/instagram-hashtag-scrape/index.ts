// Captação de leads via hashtag/tema no Instagram (Apify).
// Usa o actor `apify/instagram-hashtag-scraper` para buscar posts recentes
// de uma hashtag e enriquecer com bio/perfil dos autores.
//
// POST body: { hashtags: ["marketing", "vendas"], results_limit?: 30 }

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { resolveApifyKey } from "../_shared/apify-key.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

const APIFY_BASE = "https://api.apify.com/v2";

async function runActor(token: string, actorId: string, input: any, timeoutMs = 120000) {
  const r = await fetch(`${APIFY_BASE}/acts/${actorId}/run-sync-get-dataset-items?token=${token}&timeout=${Math.floor(timeoutMs/1000)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  const t = await r.text();
  if (!r.ok) throw new Error(`Apify ${actorId} ${r.status}: ${t.slice(0, 300)}`);
  try { return JSON.parse(t); } catch { return []; }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const auth = req.headers.get("Authorization") ?? "";
    if (!auth.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);
    const SUPA = Deno.env.get("SUPABASE_URL")!;
    const SR = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const userClient = createClient(SUPA, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: auth } },
    });
    const { data: u } = await userClient.auth.getUser();
    const userId = u?.user?.id;
    if (!userId) return json({ error: "Unauthenticated" }, 401);
    const admin = createClient(SUPA, SR);

    const body = await req.json().catch(() => ({} as any));
    const hashtags: string[] = (Array.isArray(body.hashtags) ? body.hashtags : [])
      .map((h: any) => String(h).trim().replace(/^#/, ""))
      .filter(Boolean);
    const limit = Math.min(100, Math.max(5, parseInt(body.results_limit, 10) || 30));
    if (hashtags.length === 0) return json({ error: "hashtags obrigatório" }, 400);

    // Apify key: helper resolve chave própria → toggle admin → env (fallback nos 2 nomes)
    const APIFY = (await resolveApifyKey(admin, userId))
      || Deno.env.get("APIFY_API_TOKEN")
      || Deno.env.get("APIFY_API_KEY");
    if (!APIFY) return json({ error: "Apify API key não configurada em Configurações → APIs." }, 400);

    // 1) Posts por hashtag
    const posts: any[] = await runActor(APIFY, "apify~instagram-hashtag-scraper", {
      hashtags,
      resultsLimit: limit,
    }).catch((e) => { throw new Error(e.message); });

    // 2) Coleta usernames únicos
    const byUser = new Map<string, { hashtag: string; post: any }>();
    for (const p of posts ?? []) {
      const username = String(p.ownerUsername ?? p.username ?? p.owner?.username ?? "").trim();
      if (!username) continue;
      const ht = (p.hashtags?.[0] ?? hashtags[0]).toString().replace(/^#/, "");
      if (!byUser.has(username)) byUser.set(username, { hashtag: ht, post: p });
    }

    if (byUser.size === 0) {
      return json({ ok: true, saved: 0, posts: posts?.length ?? 0, message: "Nenhum perfil encontrado." });
    }

    // 3) Enrich bios via instagram-profile-scraper (paralelo, max 50)
    const usernames = Array.from(byUser.keys()).slice(0, 50);
    let profiles: any[] = [];
    try {
      profiles = await runActor(APIFY, "apify~instagram-profile-scraper", { usernames });
    } catch (_) { profiles = []; }
    const profByUser = new Map(profiles.map((p: any) => [String(p.username ?? "").toLowerCase(), p]));

    const rows = Array.from(byUser.entries()).map(([username, { hashtag, post }]) => {
      const prof = profByUser.get(username.toLowerCase()) || {};
      return {
        user_id: userId,
        hashtag,
        username,
        full_name: prof.fullName ?? post.ownerFullName ?? null,
        bio: prof.biography ?? null,
        followers: prof.followersCount ?? null,
        post_url: post.url ?? null,
        post_caption: (post.caption ?? "").toString().slice(0, 500),
      };
    });

    const { error: upErr, count } = await admin
      .from("instagram_hashtag_leads")
      .upsert(rows, { onConflict: "user_id,hashtag,username", ignoreDuplicates: true, count: "exact" });
    if (upErr) return json({ error: upErr.message }, 500);

    return json({ ok: true, hashtags, posts_found: posts?.length ?? 0, profiles: rows.length, saved: count ?? rows.length });
  } catch (e: any) {
    return json({ error: String(e?.message ?? e) }, 500);
  }
});
