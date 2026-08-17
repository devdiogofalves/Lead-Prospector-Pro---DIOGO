// social-comment-responder — webhook público do Unipile para comentários/likes/follows.
// URL: /functions/v1/social-comment-responder?token=UNIPILE_WEBHOOK_SECRET
// v4 (2026-07-17): humanização — gpt-4o + anti-jargão + retry + tenant prompt via social-brain.
//                Mantém transporte Unipile e proteções próprias (require_follower, dedup).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { generateAIContent } from "../_shared/ai-json.ts";
import { buildEngageContext, decideEngagement, applyEscalation } from "../_shared/social-brain.ts";

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "*", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const resp = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const WEBHOOK_SECRET = Deno.env.get("UNIPILE_WEBHOOK_SECRET") ?? "";

const TONE_GUIDE: Record<string, string> = {
  casual: "Tom descontraído, próximo, com 0-1 emoji por mensagem.",
  professional: "Tom profissional, claro, direto, sem emojis.",
  consultive: "Tom consultivo SPIN: faça UMA pergunta de descoberta no fim.",
};

async function aiRewrite(admin: any, userId: string, baseText: string, ctx: string, tone: string): Promise<string> {
  try {
    // v5 2026-07-25: enriquece com briefing do tenant (prospecting_profiles + branding)
    // pra resposta soar como time do cliente, não bot genérico.
    const [{ data: prof }, { data: brand }] = await Promise.all([
      admin.from("prospecting_profiles").select("produto, publico_alvo, diferenciais, system_prompt").eq("user_id", userId).maybeSingle(),
      admin.from("company_branding").select("company_name, agent_name").eq("user_id", userId).maybeSingle(),
    ]);
    const agent = String(brand?.agent_name ?? "").trim() || "atendente";
    const company = String(brand?.company_name ?? "").trim() || "nossa empresa";
    const briefing = [
      prof?.produto && `Produto: ${prof.produto}`,
      prof?.publico_alvo && `Público: ${prof.publico_alvo}`,
      prof?.diferenciais && `Diferenciais: ${prof.diferenciais}`,
    ].filter(Boolean).join(" | ");
    const extra = String(prof?.system_prompt ?? "").trim().slice(0, 800);
    const system = [
      `Você é ${agent}, atendente REAL da ${company}. Está respondendo interação (comentário/like/follow) em redes sociais em PT-BR.`,
      briefing && `Contexto do negócio: ${briefing}.`,
      extra && `Instruções extras do operador: ${extra}`,
      TONE_GUIDE[tone] ?? TONE_GUIDE.casual,
      `Regras: 1-2 frases curtas. Sem pitch agressivo. Sem "prezado", "notei que você é", "vasta experiência". Fale humano.`,
      `Retorne APENAS o texto final da mensagem, sem aspas, sem markdown, sem prefixo.`,
    ].filter(Boolean).join("\n");
    const out = await generateAIContent(admin, userId, {
      system,
      user: `Situação: ${ctx}\n\nMensagem base sugerida (reescreva mantendo intenção): "${baseText}"`,
      maxTokens: 220,
    });
    return (out || "").trim() || baseText;
  } catch { return baseText; }
}


async function unipileSendDM(admin: any, userId: string, accountId: string, actorProviderId: string, text: string): Promise<{ ok: boolean; err: string | null }> {
  try {
    const { data: keyRow } = await admin.from("user_api_keys").select("api_key, extra").eq("user_id", userId).eq("provider", "unipile").maybeSingle();
    const apiKey = (keyRow?.api_key ?? "").trim();
    const dsn = ((keyRow?.extra as any)?.dsn ?? "https://api.unipile.com:443").replace(/\/+$/, "");
    const fd = new FormData();
    fd.set("account_id", accountId);
    fd.set("text", text);
    fd.append("attendees_ids", actorProviderId);
    const rr = await fetch(`${dsn}/api/v1/chats`, { method: "POST", headers: { "X-API-KEY": apiKey }, body: fd });
    const tt = await rr.text();
    return { ok: rr.ok, err: rr.ok ? null : `${rr.status}: ${tt.slice(0,200)}` };
  } catch (e: any) {
    return { ok: false, err: String(e?.message ?? e).slice(0,200) };
  }
}

async function unipileReplyComment(admin: any, userId: string, accountId: string, unipilePostId: string, text: string) {
  try {
    const { data: keyRow } = await admin.from("user_api_keys").select("api_key, extra").eq("user_id", userId).eq("provider", "unipile").maybeSingle();
    const apiKey = (keyRow?.api_key ?? "").trim();
    const dsn = ((keyRow?.extra as any)?.dsn ?? "https://api.unipile.com:443").replace(/\/+$/, "");
    await fetch(`${dsn}/api/v1/posts/${encodeURIComponent(unipilePostId)}/comments`, {
      method: "POST",
      headers: { "X-API-KEY": apiKey, "Content-Type": "application/json" },
      body: JSON.stringify({ text, account_id: accountId }),
    });
  } catch {/* não bloqueia */}
}

async function unipileIsFollower(admin: any, userId: string, accountId: string, actorProviderId: string): Promise<boolean | null> {
  // Retorna null se não conseguir checar (não bloqueia o fluxo).
  try {
    const { data: keyRow } = await admin.from("user_api_keys").select("api_key, extra").eq("user_id", userId).eq("provider", "unipile").maybeSingle();
    const apiKey = (keyRow?.api_key ?? "").trim();
    const dsn = ((keyRow?.extra as any)?.dsn ?? "https://api.unipile.com:443").replace(/\/+$/, "");
    const r = await fetch(`${dsn}/api/v1/users/${encodeURIComponent(actorProviderId)}/relations?account_id=${encodeURIComponent(accountId)}`, {
      headers: { "X-API-KEY": apiKey },
    });
    if (!r.ok) return null;
    const j = await r.json();
    // Heurística defensiva: vários shapes possíveis.
    const flags = JSON.stringify(j).toLowerCase();
    if (/"is_follower"\s*:\s*true/.test(flags)) return true;
    if (/"following_me"\s*:\s*true/.test(flags)) return true;
    if (/"is_follower"\s*:\s*false/.test(flags)) return false;
    return null;
  } catch { return null; }
}


Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const url = new URL(req.url);
    const token = url.searchParams.get("token") ?? "";
    if (WEBHOOK_SECRET && token !== WEBHOOK_SECRET) return resp({ error: "invalid token" }, 401);

    const event = await req.json().catch(() => ({}));
    const eventType = event?.event ?? event?.type ?? "";
    if (!/comment/i.test(eventType) && !/reaction|like/i.test(eventType) && !/follow/i.test(eventType)) {
      return resp({ ok: true, skipped: "event type not handled" });
    }

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);
    const accountId = event?.account_id ?? event?.accountId ?? "";
    const unipilePostId = event?.post_id ?? event?.postId ?? event?.target_id ?? event?.targetId ?? "";

    // post pode não existir para like/follow puro
    let userId: string | null = null;
    let post: any = null;
    if (unipilePostId) {
      const { data } = await admin.from("social_posts").select("*").eq("unipile_post_id", unipilePostId).maybeSingle();
      post = data;
      userId = post?.user_id ?? null;
    }
    if (!userId && accountId) {
      const { data: keyRow } = await admin.from("user_api_keys").select("user_id").eq("provider", "unipile")
        .filter("extra->>account_id", "eq", accountId).maybeSingle();
      userId = keyRow?.user_id ?? null;
    }
    if (!userId) return resp({ ok: true, skipped: "no_user_for_account" });

    const interactionType: "comment" | "like" | "follow" =
      /comment/i.test(eventType) ? "comment" : /reaction|like/i.test(eventType) ? "like" : "follow";

    const author = event?.author ?? event?.from ?? event?.user ?? {};
    const content = String(event?.comment?.text ?? event?.text ?? event?.message ?? "");
    const actorProviderId = String(author?.provider_id ?? author?.id ?? author?.user_id ?? "");
    const actorHandle = String(author?.username ?? author?.handle ?? "");
    const actorName = String(author?.name ?? author?.display_name ?? "");
    const eventId = String(event?.id ?? event?.event_id ?? `${unipilePostId}_${actorProviderId}_${Date.now()}`);

    const { data: existing } = await admin.from("social_post_interactions").select("id").eq("unipile_event_id", eventId).maybeSingle();
    if (existing) return resp({ ok: true, skipped: "duplicate" });

    const channel = post?.channel ?? (/linkedin/i.test(String(event?.provider ?? event?.platform ?? "")) ? "linkedin" : "instagram");
    const displayName = actorName || actorHandle || "amigo(a)";
    const fillVars = (s: string) => s.replaceAll("{name}", displayName).replaceAll("{handle}", actorHandle || displayName);

    const { data: interaction } = await admin.from("social_post_interactions").insert({
      user_id: userId, post_id: post?.id ?? null, channel, type: interactionType,
      actor_handle: actorHandle, actor_name: actorName, actor_provider_id: actorProviderId,
      content, unipile_event_id: eventId,
    }).select().single();

    // Carrega regras ordenadas
    const { data: rulesAll } = await admin
      .from("social_auto_engage_rules").select("*").eq("user_id", userId).eq("channel", channel).eq("active", true)
      .order("priority", { ascending: true });
    const list = (rulesAll ?? []) as any[];

    // Seleciona regra por tipo de interação
    const lcContent = content.toLowerCase();
    let rule: any = null;
    if (interactionType === "comment") {
      rule = list.find(r => r.mode === "keyword" && r.keyword && lcContent.includes(String(r.keyword).toLowerCase())) ??
             list.find(r => r.mode === "global") ?? null;
    } else if (interactionType === "like") {
      rule = list.find(r => r.mode === "thank_like") ?? null;
    } else if (interactionType === "follow") {
      rule = list.find(r => r.mode === "welcome_follow") ?? null;
    }

    // LEGACY (Fase 2, passo 1): ramo mantido só para posts antigos com auto_dm_* em social_posts.
    // Novas automações são gravadas exclusivamente em social_auto_engage_rules pela UI.
    const legacyShouldDM = post && (
      (interactionType === "comment" && post.auto_dm_enabled) ||
      (interactionType === "like" && post.auto_dm_on_like) ||
      (interactionType === "follow" && post.auto_dm_on_follow)
    );

    if (!rule && !legacyShouldDM) {
      return resp({ ok: true, interaction_id: interaction?.id, dm_sent: false, reason: "no rule matched" });
    }

    if (post && legacyShouldDM && interactionType === "comment" && post.auto_dm_trigger_keyword) {
      const kw = String(post.auto_dm_trigger_keyword).toLowerCase().trim();
      if (kw && !lcContent.includes(kw)) {
        return resp({ ok: true, interaction_id: interaction?.id, dm_sent: false, reason: "keyword not matched" });
      }
    }

    let dmText = "";
    let publicReplyText = "";
    let dmOk = false;
    let dmErr: string | null = null;
    let spinStage: string | null = null;
    let qualified = false;
    const wantDM = rule ? rule.send_dm : !!legacyShouldDM;

    if (rule) {
      const baseDm = fillVars(rule.dm_template || "");

      // ===== Modo global (comentário) com IA contextual (shared brain) =====
      if (rule.mode === "global" && interactionType === "comment" && rule.use_ai) {
        const ctx = await buildEngageContext(admin, userId, {
          post,
          actorProviderId,
          leadText: content,
          defaultLink: rule.default_link ?? "",
          moveToDm: rule.move_to_dm_on_interest !== false,
        });
        const decision = await decideEngagement({
          ctx,
          eventType: "comment",
          text: content,
          tone: rule.ai_tone ?? "casual",
          baseDm,
          name: displayName,
        });
        publicReplyText = decision.public_reply ?? "";
        dmText = decision.dm_text ?? "";
        spinStage = decision.spin_stage;
        qualified = decision.qualified;
        if (dmText) dmText = applyEscalation(dmText, decision, ctx);
      }
      // ===== Modo keyword com gate de seguidor =====
      else if (rule.mode === "keyword" && interactionType === "comment") {
        if (rule.require_follower) {
          const isFollower = await unipileIsFollower(admin, userId, accountId, actorProviderId);
          if (isFollower === false) {
            dmText = fillVars(`Oi {name}! Pra liberar o presente, dá uma seguida no perfil primeiro 🙏 Aí me responde aqui e te mando na hora.`);
          }
        }
        if (!dmText) {
          dmText = rule.use_ai
            ? await aiRewrite(admin, userId, baseDm, `Lead "${displayName}" comentou "${content}" pedindo presente/info.`, rule.ai_tone ?? "casual")
            : baseDm;
          if (rule.cta_link) {
            const label = rule.cta_label || "Confere aqui";
            dmText = `${dmText}\n\n👉 ${label}: ${rule.cta_link}`;
          }
        }
        publicReplyText = rule.reply_public ? fillVars(rule.public_reply_template || "") : "";
      }
      // ===== Modos thank_like / welcome_follow =====
      else if (rule.mode === "thank_like" || rule.mode === "welcome_follow") {
        const ctx = rule.mode === "thank_like" ? `${displayName} curtiu um post.` : `${displayName} virou novo seguidor.`;
        dmText = rule.use_ai ? await aiRewrite(admin, userId, baseDm, ctx, rule.ai_tone ?? "casual") : baseDm;
      }
      // ===== Fallback (modo global sem IA, etc.) =====
      else {
        dmText = rule.use_ai
          ? await aiRewrite(admin, userId, baseDm, `Lead "${displayName}" interagiu (${interactionType}) — comentário: "${content}"`, rule.ai_tone ?? "casual")
          : baseDm;
        publicReplyText = rule.reply_public ? fillVars(rule.public_reply_template || "") : "";
      }
    } else if (post) {
      dmText = post.auto_dm_message ?? "";
      if (!dmText && interactionType === "comment" && content) {
        dmText = `Oi! Vi seu comentário "${content.slice(0,60)}". Posso te mandar detalhes por aqui?`;
      }
      // anexa link/CTA configurado no Boost Reply do post
      if (post.auto_dm_link) {
        const label = post.auto_dm_cta_label || "Acessar";
        dmText = `${dmText}\n\n👉 ${label}: ${post.auto_dm_link}`;
      }
    }

    // Envio
    if (wantDM && actorProviderId && dmText) {
      const r = await unipileSendDM(admin, userId, accountId, actorProviderId, dmText);
      dmOk = r.ok; dmErr = r.err;
    }
    if (interactionType === "comment" && publicReplyText && unipilePostId) {
      await unipileReplyComment(admin, userId, accountId, unipilePostId, publicReplyText);
    }

    await admin.from("social_post_interactions").update({
      dm_sent: dmOk, dm_content: dmText, error: dmErr,
      spin_stage: spinStage ?? null, qualified: !!qualified,
    }).eq("id", interaction!.id);

    // ===== Agendar follow-up (like/follow) =====
    if (rule && (rule.mode === "thank_like" || rule.mode === "welcome_follow") &&
        rule.followup_delay_hours && rule.followup_message && actorProviderId) {
      const scheduledAt = new Date(Date.now() + Number(rule.followup_delay_hours) * 3600_000).toISOString();
      await admin.from("social_scheduled_followups").insert({
        user_id: userId,
        rule_id: rule.id,
        channel,
        account_id: accountId,
        actor_provider_id: actorProviderId,
        actor_name: actorName,
        actor_handle: actorHandle,
        scheduled_at: scheduledAt,
        message: fillVars(rule.followup_message),
        use_ai: !!rule.followup_use_ai,
        context: { tone: rule.ai_tone, trigger: interactionType, post_id: unipilePostId },
      });
    }

    // Métricas + lead
    if (rule?.id) {
      const cur = (await admin.from("social_auto_engage_rules").select("hits_count").eq("id", rule.id).maybeSingle()).data?.hits_count ?? 0;
      await admin.from("social_auto_engage_rules").update({ hits_count: cur + 1, last_hit_at: new Date().toISOString() }).eq("id", rule.id);
    }

    if (dmOk) {
      if (post?.id) {
        await admin.rpc("increment_social_post_dms", { _post_id: post.id }).catch(() => {});
        await admin.from("social_posts").update({ dms_sent: (post.dms_sent ?? 0) + 1 }).eq("id", post.id);
      }
      const shouldCaptureLead = rule ? rule.capture_lead : true;
      if (shouldCaptureLead) {
        const leadTable = channel === "instagram" ? "instagram_contacts" : "linkedin_contacts";
        try {
          const leadInsert: any = { user_id: userId };
          if (channel === "instagram") {
            leadInsert.username = actorHandle || actorProviderId;
            leadInsert.nome = actorName; leadInsert.provider_id = actorProviderId;
          } else {
            leadInsert.nome = actorName; leadInsert.linkedin_url = author?.profile_url ?? null;
            leadInsert.provider_id = actorProviderId;
          }
          const { data: lead } = await admin.from(leadTable).insert(leadInsert).select("id").maybeSingle();
          if (lead?.id) {
            await admin.from("social_post_interactions").update({ lead_created: true, lead_table: leadTable, lead_id: lead.id }).eq("id", interaction!.id);
            if (post?.id) await admin.from("social_posts").update({ leads_created: (post.leads_created ?? 0) + 1 }).eq("id", post.id);
          }
        } catch {/* lead opcional */}
      }
    }

    return resp({ ok: true, interaction_id: interaction?.id, dm_sent: dmOk, dm_error: dmErr });
  } catch (e: any) {
    return resp({ error: String(e?.message ?? e).slice(0, 400) }, 500);
  }
});
