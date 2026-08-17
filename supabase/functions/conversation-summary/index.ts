import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } } }
    );
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return new Response(JSON.stringify({ error: "Não autenticado" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const { conversationId } = await req.json();
    if (!conversationId) throw new Error("conversationId obrigatório");

    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const [{ data: conv }, { data: msgs }, { data: keyRow }, { data: branding }] = await Promise.all([
      admin.from("qualification_conversations").select("*").eq("id", conversationId).eq("user_id", user.id).maybeSingle(),
      admin.from("qualification_messages").select("role, content, created_at").eq("conversation_id", conversationId).order("created_at", { ascending: true }).limit(60),
      admin.from("user_api_keys").select("api_key").eq("user_id", user.id).eq("provider", "gemini").maybeSingle(),
      admin.from("company_branding").select("company_name, agent_name").eq("user_id", user.id).maybeSingle(),
    ]);

    if (!conv) throw new Error("Conversa não encontrada");

    // Chave própria do cliente OU chave admin-compartilhada (admin_shared_apis) via RPC.
    let geminiApiKey: string | null = keyRow?.api_key ?? null;
    try {
      const { data: _gk } = await admin.rpc("get_ai_key_for_user", { _user_id: user.id, _provider: "gemini" });
      if (_gk) geminiApiKey = _gk;
    } catch (_e) { /* mantém a chave própria do cliente */ }
    if (!geminiApiKey) throw new Error("Configure sua chave Gemini em Configurações > APIs (provider: gemini)");

    const agentName = branding?.agent_name ?? "IA";
    const companyName = branding?.company_name ?? "nossa empresa";
    const transcript = (msgs ?? []).map((m: any) => `${m.role === "user" ? "LEAD" : agentName.toUpperCase()}: ${m.content || "[áudio]"}`).join("\n");

    const prompt = `Você é um analista comercial sênior da ${companyName}. Analise a conversa abaixo entre a SDR ${agentName} e o lead, e gere um RESUMO EXECUTIVO objetivo para handoff ao comercial responsável.\n\nLead: ${conv.nome ?? "—"} | Telefone: ${conv.telefone}\n\n--- TRANSCRIÇÃO ---\n${transcript}\n--- FIM ---\n\nRetorne em markdown EXATAMENTE com estas seções:\n## 🎯 Interesse\n(1-2 linhas: nível de interesse e intenção real)\n\n## 💡 Dores identificadas\n- bullets curtos\n\n## 📌 Pontos-chave\n- bullets com fatos do lead (volume, equipe, contexto específico)\n\n## ⏭️ Próximo passo sugerido\n(1 linha objetiva — ex: agendar reunião, enviar proposta, descartar)\n\n## 🌡️ Temperatura\n🔥 Quente | 🌤️ Morno | ❄️ Frio (escolha um)`;

    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiApiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.3, maxOutputTokens: 800 },
        }),
      }
    );
    const gd = await geminiRes.json();
    if (!geminiRes.ok) throw new Error("Gemini: " + JSON.stringify(gd));
    const summary = gd.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
    if (!summary) throw new Error("Resposta vazia do Gemini");

    await admin.from("qualification_conversations").update({ summary }).eq("id", conversationId);

    return new Response(JSON.stringify({ summary }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});