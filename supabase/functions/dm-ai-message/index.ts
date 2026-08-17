// redeploy 2026-07-10c prompt-core
// dm-ai-message — DM curta SPIN+Rapport para Instagram e Telegram.
// Body: { channel: "instagram"|"telegram", leads: [{id, nome_empresa?, nome_contato?, handle?, bio?, especialidades?}] }
// Retorno: { items: [{id, text}] }

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { loadProspectContext, buildSpinSystem, callTextLLM } from "../_shared/spin-prompt.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const resp = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const auth = req.headers.get("Authorization") ?? "";
    if (!auth.startsWith("Bearer ")) return resp({ error: "Missing Authorization" }, 401);
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);
    const userClient = createClient(SUPABASE_URL, SERVICE_ROLE, { global: { headers: { Authorization: auth } } });
    const { data: u } = await userClient.auth.getUser();
    const userId = u?.user?.id;
    if (!userId) return resp({ error: "Unauthenticated" }, 401);

    const body = await req.json().catch(() => ({}));
    const channel = String(body?.channel ?? "instagram") as "instagram" | "telegram";
    const leads: any[] = Array.isArray(body?.leads) ? body.leads : [];
    if (leads.length === 0) return resp({ error: "leads vazio" }, 400);
    if (leads.length > 20) return resp({ error: "max 20 leads" }, 400);

    const ctx = await loadProspectContext(admin, userId);
    const system = buildSpinSystem({ channel, stage: "abertura", ctx });

    const items: any[] = [];
    for (const lead of leads) {
      const leadCtx = [
        lead.nome_empresa && `Empresa/Perfil: ${lead.nome_empresa}`,
        lead.nome_contato && `Nome do contato: ${lead.nome_contato}`,
        lead.handle && `Handle: @${String(lead.handle).replace(/^@+/, "")}`,
        lead.bio && `Bio: ${String(lead.bio).slice(0, 240)}`,
        lead.especialidades && `Sobre: ${String(lead.especialidades).slice(0, 240)}`,
      ].filter(Boolean).join("\n");

      const userPrompt = `DESTINATÁRIO:
${leadCtx || "(sem dados específicos do lead)"}

Gere a mensagem de abertura DM seguindo TODAS as regras do system prompt acima.
Retorne JSON estrito: {"text": "mensagem aqui"}`;

      try {
        const raw = await callTextLLM(admin, userId, { system, user: userPrompt, json: true });
        const parsed = JSON.parse(raw);
        const text = String(parsed.text ?? "").trim();
        if (!text) throw new Error("texto vazio");
        items.push({ id: lead.id, text });
      } catch (e: any) {
        items.push({ id: lead.id, error: String(e?.message ?? e).slice(0, 200) });
      }
    }
    return resp({ items });
  } catch (e: any) {
    return resp({ error: String(e?.message ?? e).slice(0, 400) }, 500);
  }
});
