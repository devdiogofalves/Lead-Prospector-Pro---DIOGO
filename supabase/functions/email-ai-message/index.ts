// redeploy 2026-07-14 hero-public + reply_to guard
// email-ai-message — Cold email SPIN+Rapport com HTML elegante + hero image gerada por IA.
// Body: { leads: [{id, nome_empresa, nome_contato?, cargo?, especialidades?, site?, segmento?}] }
// Retorno: { items: [{id, subject, html, text}] }

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { loadProspectContext, buildSpinSystem, callTextLLM, generateHeroImage } from "../_shared/spin-prompt.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const resp = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// Permite apenas <strong>/<b>/<em>/<i> no corpo gerado pela IA. Resto é escapado.
function sanitizeInline(p: string): string {
  const ALLOWED = /<\/?(strong|b|em|i)>/gi;
  const tokens: string[] = [];
  const replaced = p.replace(ALLOWED, (m) => {
    const norm = m.toLowerCase()
      .replace("<b>", "<strong>").replace("</b>", "</strong>")
      .replace("<i>", "<em>").replace("</i>", "</em>");
    tokens.push(norm);
    return `\u0000${tokens.length - 1}\u0000`;
  });
  let safe = escapeHtml(replaced).replace(/\n/g, "<br>");
  safe = safe.replace(/\u0000(\d+)\u0000/g, (_m, i) => tokens[Number(i)] ?? "");
  return safe;
}

function paragraphs(text: string): string {
  return text
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => `<p style="margin:0 0 16px 0;color:#1f2937;font-size:16px;line-height:1.65;">${sanitizeInline(p)}</p>`)
    .join("\n");
}

function waUrl(raw: string, greeting?: string): string | null {
  const digits = String(raw || "").replace(/\D/g, "");
  if (digits.length < 10) return null;
  const num = digits.startsWith("55") ? digits : `55${digits}`;
  const msg = greeting ? `?text=${encodeURIComponent(greeting)}` : "";
  return `https://wa.me/${num}${msg}`;
}

interface EmailParts {
  subject: string;
  preheader: string;
  greeting: string;
  body: string; // múltiplos parágrafos separados por \n\n
  cta_text: string;
  signature: string;
  hero_prompt: string;
}

function renderHtml(parts: EmailParts, ctx: any, heroUrl: string | null, replyTo?: string): string {
  const primary = ctx.branding?.primary_color || "#1f2937";
  const company = escapeHtml(ctx.company_name);
  const agent = escapeHtml(ctx.agent_name);
  const logoHtml = ctx.branding?.logo_url
    ? `<img src="${escapeHtml(ctx.branding.logo_url)}" alt="${company}" style="max-height:36px;display:block;">`
    : `<div style="font-size:18px;font-weight:700;color:${primary};letter-spacing:-0.01em;">${company}</div>`;

  const heroHtml = heroUrl
    ? `<div style="margin:0;"><img src="${escapeHtml(heroUrl)}" alt="" style="display:block;width:100%;height:auto;border-radius:12px;"></div>`
    : "";

  const waNumber = ctx.branding?.whatsapp_number;
  const waLabel = ctx.branding?.whatsapp_cta_label || "Falar no WhatsApp";
  const waGreeting = `Oi! Vi seu e-mail sobre ${parts.subject}. Podemos conversar?`;
  const waHref = waNumber ? waUrl(waNumber, waGreeting) : null;
  const replyToClean = (replyTo ?? "").trim();

  // CTA primário: mailto se houver reply_to; senão WhatsApp; senão nenhum botão.
  const primaryCta = replyToClean
    ? `<td style="border-radius:8px;background:${primary};">
        <a href="mailto:${escapeHtml(replyToClean)}?subject=${encodeURIComponent("Re: " + parts.subject)}"
           style="display:inline-block;padding:13px 26px;color:#ffffff;text-decoration:none;font-weight:600;font-size:15px;border-radius:8px;">
          ${escapeHtml(parts.cta_text)}
        </a>
      </td>`
    : waHref
      ? `<td style="border-radius:8px;background:#25D366;">
          <a href="${waHref}" target="_blank" rel="noopener"
             style="display:inline-block;padding:13px 26px;color:#ffffff;text-decoration:none;font-weight:600;font-size:15px;border-radius:8px;">
            ${escapeHtml(parts.cta_text)}
          </a>
        </td>`
      : "";

  const waSecondary = replyToClean && waHref
    ? `<td style="width:10px;"></td>
       <td style="border-radius:8px;background:#25D366;">
         <a href="${waHref}" target="_blank" rel="noopener"
            style="display:inline-block;padding:13px 26px;color:#ffffff;text-decoration:none;font-weight:600;font-size:15px;border-radius:8px;">
           ${escapeHtml(waLabel)}
         </a>
       </td>`
    : "";

  const ctaButton = primaryCta
    ? `<table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:8px 0 20px;"><tr>${primaryCta}${waSecondary}</tr></table>`
    : "";

  return `<!DOCTYPE html><html lang="pt-BR"><head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escapeHtml(parts.subject)}</title>
</head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">
<div style="display:none;max-height:0;overflow:hidden;">${escapeHtml(parts.preheader)}</div>
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#f3f4f6;padding:32px 16px;">
  <tr><td align="center">
    <table role="presentation" width="600" cellspacing="0" cellpadding="0" border="0" style="max-width:600px;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.06);">
      <tr><td style="padding:24px 32px 0;">${logoHtml}</td></tr>
      ${heroHtml ? `<tr><td style="padding:20px 32px 0;">${heroHtml}</td></tr>` : ""}
      <tr><td style="padding:24px 32px 8px;">
        <p style="margin:0 0 16px 0;color:#1f2937;font-size:16px;line-height:1.65;">${escapeHtml(parts.greeting)}</p>
        ${paragraphs(parts.body)}
        ${ctaButton}
        <p style="margin:0;color:#6b7280;font-size:14px;line-height:1.5;">${escapeHtml(parts.signature)}<br><strong style="color:#1f2937;">${agent}</strong> · ${company}</p>
      </td></tr>
      <tr><td style="padding:24px 32px;border-top:1px solid #e5e7eb;text-align:center;">
        <p style="margin:0;color:#9ca3af;font-size:12px;line-height:1.5;">Você recebeu este e-mail porque ${company} acredita que pode agregar valor ao seu trabalho.</p>
      </td></tr>
    </table>
  </td></tr>
</table>
</body></html>`;
}

function plainText(parts: EmailParts, ctx: any): string {
  return `${parts.greeting}\n\n${parts.body}\n\n${parts.cta_text}\n\n${parts.signature}\n— ${ctx.agent_name}, ${ctx.company_name}`;
}

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
    const leads: any[] = Array.isArray(body?.leads) ? body.leads : [];
    if (leads.length === 0) return resp({ error: "leads vazio" }, 400);
    if (leads.length > 20) return resp({ error: "max 20 leads por chamada" }, 400);
    const replyTo: string | undefined = body?.reply_to;
    const withHero: boolean = body?.with_hero !== false; // default true

    const ctx = await loadProspectContext(admin, userId);
    const system = buildSpinSystem({
      channel: "email",
      stage: "abertura",
      ctx,
      extraInstructions: `\nIMPORTANTE — RETORNE JSON COM ESTES CAMPOS:
{
  "subject": "assunto 4-8 palavras",
  "preheader": "frase de preview 60-90 caracteres que reforça abertura",
  "greeting": "saudação curta tipo 'Oi João,' (sem 'tudo bem?')",
  "body": "corpo em 3 parágrafos separados por linha em branco (\\n\\n). Parágrafo 1: observação específica do lead. Parágrafo 2: desafio do segmento + 1 pergunta diagnóstica. Parágrafo 3: posicionamento leve. PODE usar <strong>...</strong> em 1-2 trechos curtos (números, palavras-chave do diagnóstico) e <em>...</em> em 1 nuance sutil — sem exagero, no máximo 3 destaques no e-mail inteiro. NUNCA use markdown (**, *, _) — apenas as tags HTML <strong> e <em>.",
  "cta_text": "texto do botão CTA, 3-5 palavras, ex: 'Topa uma conversa de 15 min?'",
  "signature": "frase de despedida curta antes do nome, ex: 'Abraço,'",
  "hero_prompt": "descrição EM INGLÊS de uma cena tech/HUD futurista que represente metaforicamente o tema do e-mail (ex: rede de conexões, dashboard de leads, gráfico ascendente, nó de network, pipeline). SEM rostos, SEM texto, SEM logos."
}`,
    });

    const items: any[] = [];
    for (const lead of leads) {
      const leadCtx = [
        lead.nome_empresa && `Empresa: ${lead.nome_empresa}`,
        lead.nome_contato && `Contato: ${lead.nome_contato}`,
        lead.cargo && `Cargo: ${lead.cargo}`,
        lead.segmento && `Segmento: ${lead.segmento}`,
        lead.especialidades && `Sobre: ${String(lead.especialidades).slice(0, 280)}`,
        lead.site && `Site: ${lead.site}`,
      ].filter(Boolean).join("\n");

      const userPrompt = `DESTINATÁRIO:
${leadCtx || "(sem dados específicos)"}

Gere o JSON do e-mail SPIN seguindo TODAS as regras.`;

      try {
        const raw = await callTextLLM(admin, userId, { system, user: userPrompt, json: true, maxTokens: 1200 });
        const parsed = JSON.parse(raw) as EmailParts;
        if (!parsed.subject || !parsed.body) throw new Error("resposta incompleta da IA");

        let heroUrl: string | null = null;
        if (withHero && parsed.hero_prompt) {
          const raw = await generateHeroImage(
            admin,
            userId,
            `${parsed.hero_prompt}. Visual style: dark cinematic tech aesthetic, deep matte black background (#000–#0a0a0a), vibrant neon green accents (#39FF14 / #22ff66) glowing softly, subtle circuit board and HUD elements, thin glowing lines, holographic data panels, particle mist, futuristic dashboard mood, professional high-end product key visual, cinematic lighting, ultra sharp, 16:9 wide composition, premium B2B SaaS branding (LeadsBooster style). Absolutely NO text, NO letters, NO numbers, NO logos, NO human faces.`
          );
          // Re-upload para bucket público (Gmail/Outlook rejeitam data-URLs base64
          // e signed URLs de 30d expiram). Se falhar, omite o hero — nunca inline.
          if (raw) {
            try {
              const img = await fetch(raw);
              if (img.ok) {
                const bytes = new Uint8Array(await img.arrayBuffer());
                const ct = img.headers.get("content-type") || "image/png";
                const ext = ct.includes("jpeg") || ct.includes("jpg") ? "jpg" : "png";
                const path = `email-hero/${userId}/${Date.now()}_${crypto.randomUUID()}.${ext}`;
                const up = await admin.storage.from("branding-logos").upload(path, bytes, { contentType: ct, upsert: false });
                if (!up.error) {
                  const { data: pub } = admin.storage.from("branding-logos").getPublicUrl(path);
                  heroUrl = pub?.publicUrl ?? null;
                }
              }
            } catch (e) {
              console.warn("hero public upload falhou:", (e as any)?.message);
            }
          }
        }

        const html = renderHtml(parsed, ctx, heroUrl, replyTo);
        const text = plainText(parsed, ctx);
        items.push({ id: lead.id, subject: parsed.subject, html, text });
      } catch (e: any) {
        items.push({ id: lead.id, error: String(e?.message ?? e).slice(0, 240) });
      }
    }

    return resp({ items });
  } catch (e: any) {
    return resp({ error: String(e?.message ?? e).slice(0, 400) }, 500);
  }
});
