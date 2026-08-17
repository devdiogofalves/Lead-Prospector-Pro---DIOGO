// Extração Instagram via Apify: following + commenters de um post.
// Grava em public.instagram_contacts com extraction_source/extraction_target.
//
// POST body:
//   { mode: "following",   target: "usuario_alvo", limit?: 50 }
//   { mode: "commenters",  post_url: "https://www.instagram.com/p/...", limit?: 100 }

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { resolveApifyKey } from "../_shared/apify-key.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

async function runActor(token: string, actorId: string, input: unknown, timeoutSec = 300) {
  const r = await fetch(
    `https://api.apify.com/v2/acts/${actorId}/run-sync-get-dataset-items?token=${token}&timeout=${timeoutSec}`,
    { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input) },
  );
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
    const userClient = createClient(SUPA, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: auth } },
    });
    const { data: u } = await userClient.auth.getUser();
    const userId = u?.user?.id;
    if (!userId) return json({ error: "Unauthenticated" }, 401);
    const admin = createClient(SUPA, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const body = await req.json().catch(() => ({} as any));
    const mode = String(body.mode ?? "");
    const limit = Math.min(2000, Math.max(10, parseInt(body.limit, 10) || 50));

    // Apify key: helper resolve chave própria → toggle admin → env (fallback nos 2 nomes)
    const APIFY = (await resolveApifyKey(admin, userId))
      || Deno.env.get("APIFY_API_TOKEN")
      || Deno.env.get("APIFY_API_KEY");
    if (!APIFY) return json({ error: "Apify API key não configurada em Configurações → APIs." }, 400);

    let usernames: { username: string; full_name?: string; bio?: string; post_url?: string }[] = [];
    let target = "";
    let sourceTag = mode;

    if (mode === "following") {
      target = String(body.target ?? "").replace(/^@/, "").trim();
      if (!target) return json({ error: "target obrigatório" }, 400);
      const items: any[] = await runActor(APIFY, "scraping_solutions~instagram-scraper-followers-following-no-cookies", {
        Account: [target], resultsLimit: limit, dataToScrape: "Followings",
      });
      usernames = items.map((it: any) => ({
        username: String(it.username ?? it.userName ?? "").trim(),
        full_name: it.fullName ?? it.full_name,
      })).filter((x) => x.username);
    } else if (mode === "commenters") {
      const url = String(body.post_url ?? "").trim();
      if (!/^https?:\/\/(www\.)?instagram\.com\//.test(url)) return json({ error: "post_url inválido" }, 400);
      target = url;
      const items: any[] = await runActor(APIFY, "apify~instagram-comment-scraper", {
        directUrls: [url], resultsLimit: limit,
      });
      const byUser = new Map<string, any>();
      for (const it of items) {
        const username = String(it.ownerUsername ?? it.username ?? "").trim();
        if (!username) continue;
        if (!byUser.has(username)) byUser.set(username, { username, post_url: url });
      }
      usernames = Array.from(byUser.values());
    } else {
      return json({ error: "mode deve ser 'following' ou 'commenters'" }, 400);
    }

    if (usernames.length === 0) return json({ ok: true, saved: 0, message: "Nenhum perfil encontrado." });

    // Enriquecimento básico (bio/followers) — paralelo, max 50 pra economizar Apify
    const toEnrich = usernames.slice(0, 50).map((u) => u.username);
    let enriched = new Map<string, any>();
    try {
      const prof: any[] = await runActor(APIFY, "apify~instagram-profile-scraper", { usernames: toEnrich });
      enriched = new Map(prof.map((p: any) => [String(p.username ?? "").toLowerCase(), p]));
    } catch (_) { /* opcional */ }

    const rows = usernames.map((u) => {
      const p = enriched.get(u.username.toLowerCase()) || {};
      return {
        user_id: userId,
        username: u.username,
        nome: p.fullName ?? u.full_name ?? null,
        bio: p.biography ?? null,
        seguidores: p.followersCount ?? 0,
        seguindo: p.followsCount ?? 0,
        posts: p.postsCount ?? 0,
        site: p.externalUrl ?? null,
        email: p.public_email ?? p.businessEmail ?? null,
        profile_url: `https://instagram.com/${u.username}`,
        extraction_source: sourceTag,
        extraction_target: target,
      };
    });

    const { error: upErr, count } = await admin
      .from("instagram_contacts")
      .upsert(rows, { onConflict: "user_id,username", ignoreDuplicates: false, count: "exact" });
    if (upErr) return json({ error: upErr.message }, 500);

    return json({ ok: true, found: usernames.length, saved: count ?? rows.length, mode, target });
  } catch (e: any) {
    return json({ error: String(e?.message ?? e) }, 500);
  }
});
