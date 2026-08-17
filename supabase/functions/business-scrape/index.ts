import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface ScrapeInput {
  site_url?: string;
  instagram_url?: string;
  gmb_url?: string;
  linkedin_url?: string;
}

async function getUserApiKeys(req: Request): Promise<{ gemini?: string; openai?: string }> {
  const auth = req.headers.get("Authorization");
  if (!auth) return {};
  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const { data: { user } } = await supabase.auth.getUser(auth.replace("Bearer ", ""));
    if (!user) return {};
    const { data } = await supabase
      .from("user_api_keys")
      .select("provider, api_key")
      .eq("user_id", user.id)
      .in("provider", ["gemini", "openai"]);
    const out: { gemini?: string; openai?: string } = {};
    for (const row of data ?? []) {
      if (row.provider === "gemini") out.gemini = row.api_key;
      if (row.provider === "openai") out.openai = row.api_key;
    }
    return out;
  } catch (e) {
    console.error("[business-scrape] getUserApiKeys falhou:", e);
    return {};
  }
}

function clean(s: string, max = 4000) {
  return s.replace(/\s+/g, " ").trim().slice(0, max);
}

function stripHtml(html: string) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&");
}

function extractMeta(html: string, name: string): string | undefined {
  const re = new RegExp(`<meta[^>]+(?:name|property)=["']${name}["'][^>]+content=["']([^"']+)["']`, "i");
  const m = html.match(re);
  return m?.[1];
}

async function fetchWithTimeout(url: string, ms = 12000): Promise<string> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    const r = await fetch(url, {
      signal: ctrl.signal,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
        "Accept-Language": "pt-BR,pt;q=0.9,en;q=0.8",
      },
    });
    return await r.text();
  } finally {
    clearTimeout(t);
  }
}

async function scrapeSite(url: string) {
  try {
    const html = await fetchWithTimeout(url);
    const title = html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1]?.trim();
    const description =
      extractMeta(html, "description") || extractMeta(html, "og:description");
    const ogTitle = extractMeta(html, "og:title");
    const text = clean(stripHtml(html), 6000);
    const emails = Array.from(text.matchAll(/[\w.+-]+@[\w-]+\.[\w.-]+/g)).map((m) => m[0]).slice(0, 5);
    const phones = Array.from(text.matchAll(/(\+?55\s?)?\(?\d{2}\)?\s?\d{4,5}-?\d{4}/g)).map((m) => m[0]).slice(0, 5);
    return { url, title, og_title: ogTitle, description, emails, phones, text_excerpt: text.slice(0, 3000) };
  } catch (e) {
    return { url, error: String(e) };
  }
}

async function scrapeGeneric(url: string) {
  try {
    const html = await fetchWithTimeout(url);
    const description = extractMeta(html, "og:description") || extractMeta(html, "description");
    const title = extractMeta(html, "og:title") || html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1]?.trim();
    const text = clean(stripHtml(html), 3000);
    return { url, title, description, text_excerpt: text.slice(0, 1500) };
  } catch (e) {
    return { url, error: String(e) };
  }
}

async function callOpenAICompatible(opts: {
  url: string;
  apiKey: string;
  model: string;
  systemMsg: string;
  userMsg: string;
  jsonMode?: boolean;
  label: string;
  extraHeaders?: Record<string, string>;
}): Promise<any | null> {
  try {
    const body: any = {
      model: opts.model,
      messages: [
        { role: "system", content: opts.systemMsg },
        { role: "user", content: opts.userMsg },
      ],
    };
    if (opts.jsonMode) body.response_format = { type: "json_object" };

    const resp = await fetch(opts.url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${opts.apiKey}`,
        ...(opts.extraHeaders ?? {}),
      },
      body: JSON.stringify(body),
    });
    if (!resp.ok) {
      console.error(`[business-scrape] ${opts.label} falhou:`, resp.status, await resp.text());
      return null;
    }
    const json = await resp.json();
    const content: string = json.choices?.[0]?.message?.content ?? "";
    const cleaned = content.replace(/^```json\s*/i, "").replace(/```$/i, "").trim();
    return JSON.parse(cleaned);
  } catch (err) {
    console.error(`[business-scrape] ${opts.label} exceção:`, err);
    return null;
  }
}

async function generateSuggestions(scraped: Record<string, any>, keys: { gemini?: string; openai?: string }) {
  // Compacta o conteúdo extraído num briefing pro LLM
  const briefing = Object.entries(scraped)
    .map(([k, v]) => {
      if (v?.error) return `### ${k.toUpperCase()}\n(falha: ${v.error})`;
      const parts = [
        v?.title && `Título: ${v.title}`,
        v?.description && `Descrição: ${v.description}`,
        v?.text_excerpt && `Conteúdo: ${v.text_excerpt}`,
      ].filter(Boolean);
      return `### ${k.toUpperCase()} (${v?.url ?? ""})\n${parts.join("\n")}`;
    })
    .join("\n\n");

  const systemMsg = `Você é um consultor sênior de prospecção B2B. Analise os canais oficiais da empresa abaixo e devolva um JSON estritamente válido com as chaves:
{
  "sobre_negocio": "1 parágrafo descrevendo o que a empresa faz, tom, posicionamento",
  "produto": "O que ela vende, em 1-2 frases objetivas",
  "publico_alvo": "Quem é o cliente ideal (ICP) — perfil, porte, segmento, dor principal",
  "diferenciais": "Principais diferenciais competitivos identificados (3-5 itens em linhas)",
  "pesquisa_mercado": "Pesquisa rápida de mercado do segmento dela — tendências, oportunidades, desafios atuais (3-5 bullets)",
  "canais_recomendados": [
    { "canal": "LinkedIn|Google Maps|Instagram|CNPJ", "prioridade": "alta|media|baixa", "porque": "...", "termos_busca": ["...", "..."] }
  ],
  "mensagens_conexao_exemplo": [
    "Exemplo curto de mensagem de CONEXÃO no LinkedIn (até 280 caracteres, antes do DM)",
    "Outra variação",
    "Outra variação"
  ]
}
Regra de ouro: na prospecção LinkedIn, SEMPRE enviar uma mensagem de conexão ANTES do DM de venda. As 3 mensagens devem refletir essa abordagem (humana, sem pitch, curiosa). Responda APENAS o JSON, sem markdown.`;

  const userMsg = briefing.slice(0, 8000);

  // 1) Tenta Gemini do usuário
  if (keys.gemini) {
    const out = await callOpenAICompatible({
      url: `https://generativelanguage.googleapis.com/v1beta/openai/chat/completions`,
      apiKey: keys.gemini,
      model: "gemini-2.5-flash",
      systemMsg,
      userMsg,
      jsonMode: true,
      label: "gemini-user",
    });
    if (out) return out;
  }

  // 2) Tenta OpenAI do usuário
  if (keys.openai) {
    const out = await callOpenAICompatible({
      url: "https://api.openai.com/v1/chat/completions",
      apiKey: keys.openai,
      model: "gpt-4o-mini",
      systemMsg,
      userMsg,
      jsonMode: true,
      label: "openai-user",
    });
    if (out) return out;
  }

  // 3) Fallback: Lovable AI Gateway
  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
  if (LOVABLE_API_KEY) {
    const out = await callOpenAICompatible({
      url: "https://ai.gateway.lovable.dev/v1/chat/completions",
      apiKey: LOVABLE_API_KEY,
      model: "google/gemini-3-flash-preview",
      systemMsg,
      userMsg,
      label: "lovable-gateway",
    });
    if (out) return out;
  }

  return null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body: ScrapeInput = await req.json();
    const tasks: Promise<any>[] = [];
    const labels: string[] = [];
    if (body.site_url) {
      labels.push("site");
      tasks.push(scrapeSite(body.site_url));
    }
    if (body.instagram_url) {
      labels.push("instagram");
      tasks.push(scrapeGeneric(body.instagram_url));
    }
    if (body.gmb_url) {
      labels.push("gmb");
      tasks.push(scrapeGeneric(body.gmb_url));
    }
    if (body.linkedin_url) {
      labels.push("linkedin");
      tasks.push(scrapeGeneric(body.linkedin_url));
    }
    const results = await Promise.all(tasks);
    const out: Record<string, any> = {};
    labels.forEach((l, i) => (out[l] = results[i]));

    // 🧠 Gera sugestões via IA — ordem: Gemini do usuário → OpenAI do usuário → Lovable AI Gateway
    const keys = await getUserApiKeys(req);
    const suggestions = await generateSuggestions(out, keys);

    return new Response(JSON.stringify({ ok: true, data: out, suggestions }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[business-scrape]", err);
    return new Response(JSON.stringify({ ok: false, error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
