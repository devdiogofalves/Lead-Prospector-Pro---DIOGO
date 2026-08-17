// linkedin-cadence-worker — rodado por pg_cron a cada hora cheia.
// Lê linkedin_contacts onde cadencia_status='active' e data_prox_disparo <= now()
// e dispara a próxima etapa de cada um via linkedin-dm action=cadence_advance.
//
// Safety rails:
// 1. Business hours: só roda 9-18 BRT em dias úteis (seg-sex). Fora disso, retorna sem fazer nada.
// 2. Daily limit: máx 20 DMs por usuário por dia (LinkedIn anti-ban).
// 3. Jitter: processa contatos em ordem aleatória pra evitar pattern previsível.
// 4. Auto-pause por contato: linkedin-dm marca cadencia_status='failed' após 3 falhas.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function nowInSP(): { hour: number; dayOfWeek: number } {
  // Brasília time (UTC-3). Não usa DST desde 2019.
  const utc = new Date();
  const sp = new Date(utc.getTime() - 3 * 60 * 60 * 1000);
  return { hour: sp.getUTCHours(), dayOfWeek: sp.getUTCDay() }; // 0=dom, 6=sáb
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Jitter entre disparos pra evitar pattern previsível detectável pelo anti-bot
// do LinkedIn. WhatsApp dispatch usa 45-180s — DM LinkedIn é mais sensível, mas
// 20 DMs × 60s = 20min cabe no timeout de edge function da Supabase (150s default,
// estendido até 15min em planos Pro). Mantemos faixa menor pra segurança.
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const randomDelayMs = () => 15_000 + Math.floor(Math.random() * 30_000); // 15-45s

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const admin = createClient(supabaseUrl, serviceRoleKey);

  try {
    // 1. Business hours gate
    const { hour, dayOfWeek } = nowInSP();
    if (dayOfWeek === 0 || dayOfWeek === 6 || hour < 9 || hour >= 18) {
      return json({ skipped: "outside_business_hours", hour, dayOfWeek });
    }

    // 2. Busca contatos elegíveis (status=active + data_prox_disparo já passou)
    const nowIso = new Date().toISOString();
    const { data: due, error } = await admin
      .from("linkedin_contacts")
      .select("id, user_id, nome, etapa_atual, data_prox_disparo")
      .eq("cadencia_status", "active")
      .lte("data_prox_disparo", nowIso)
      .limit(200);
    if (error) throw error;
    if (!due?.length) return json({ processed: 0, message: "Nenhum contato elegível agora." });

    // 3. Agrupa por usuário pra aplicar daily limit por user
    const byUser = new Map<string, any[]>();
    for (const c of due) {
      if (!byUser.has(c.user_id)) byUser.set(c.user_id, []);
      byUser.get(c.user_id)!.push(c);
    }

    const results: any[] = [];
    const DAILY_LIMIT_PER_USER = 20;
    // P1: cap por invocação evita estourar timeout da edge function (150s no plano free).
    // 4 contatos × 45s de jitter ≈ 3min, cabe folgado. O cron roda de hora em hora,
    // então 4/tick × 24h/dia = 96 tentativas potenciais/dia — o limite real fica no
    // DAILY_LIMIT_PER_USER=20 abaixo.
    const PER_TICK_CAP_PER_USER = 4;
    // Reset diário em 00:00 BRT (UTC-3) = 03:00 UTC. Antes era 00:00 UTC,
    // o que resetava o limite às 21h BRT — confuso pro operador.
    const todayStart = new Date();
    todayStart.setUTCHours(3, 0, 0, 0);
    if (todayStart.getTime() > Date.now()) {
      // Ainda não chegou às 03:00 UTC de hoje → o "dia BRT" atual começou ontem.
      todayStart.setUTCDate(todayStart.getUTCDate() - 1);
    }
    const todayStartIso = todayStart.toISOString();

    for (const [userId, contacts] of byUser.entries()) {
      // Toggle global: pula usuário se não ligou a cadência automática no UI.
      // Default false na migration — usuário precisa ativar explicitamente.
      const { data: integ } = await admin
        .from("user_integrations")
        .select("linkedin_cadence_enabled")
        .eq("user_id", userId)
        .maybeSingle();
      if (!integ?.linkedin_cadence_enabled) {
        results.push({ user_id: userId, skipped: "cadence_disabled" });
        continue;
      }

      // P1 fix: antes contava só `data_disparo` (sucessos). Falhas não entravam
      // no contador → bypass do limite anti-ban de 20/dia. Agora conta TENTATIVAS
      // via `last_attempt_at` (gravado pelo linkedin-dm em todo cadence_advance).
      const { count: attemptsToday } = await admin
        .from("linkedin_contacts")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId)
        .gte("last_attempt_at", todayStartIso);

      const remaining = Math.max(0, DAILY_LIMIT_PER_USER - (attemptsToday ?? 0));
      if (remaining === 0) {
        results.push({ user_id: userId, skipped: "daily_limit", attempts_today: attemptsToday });
        continue;
      }

      // Processa até `remaining` contatos deste user, em ordem aleatória,
      // com jitter de 15-45s entre disparos (anti-pattern LinkedIn).
      const toProcess = shuffle(contacts).slice(0, Math.min(remaining, PER_TICK_CAP_PER_USER));
      for (let i = 0; i < toProcess.length; i++) {
        const c = toProcess[i];
        if (i > 0) await sleep(randomDelayMs());
        try {
          // BUG FIX (mai/2026): contatos vindos do auto-prospect (Fonte 5 —
          // LinkedIn-only sem WhatsApp) entram com etapa_atual="nota_conexao".
          // Antes chamávamos action="cadence_advance" sempre — mas
          // cadence_advance recusa etapa fora de CADENCE_STEPS (primeira/
          // followup1/followup2/encerramento), e o lead NUNCA recebia a nota
          // de conexão real. Agora: se etapa é "nota_conexao", chama action
          // "invite_and_start_cadence" que envia POST /api/v1/users/invite
          // no Unipile e avança pra "primeira" (que aguarda webhook de
          // aceite). Demais etapas seguem com cadence_advance normal.
          const action = c.etapa_atual === "nota_conexao"
            ? "invite_and_start_cadence"
            : "cadence_advance";
          const r = await fetch(`${supabaseUrl}/functions/v1/linkedin-dm`, {
            method: "POST",
            headers: {
              "Authorization": `Bearer ${serviceRoleKey}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ action, contact_id: c.id, user_id: userId }),
          });
          const j = await r.json().catch(() => ({}));
          results.push({ contact_id: c.id, user_id: userId, nome: c.nome, etapa: c.etapa_atual, action, ...j });
        } catch (e: any) {
          results.push({ contact_id: c.id, user_id: userId, error: String(e?.message || e) });
        }
      }
    }

    return json({ processed: results.length, results });
  } catch (e: any) {
    console.error("linkedin-cadence-worker error:", e.message);
    return json({ error: e.message }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
