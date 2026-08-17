// deno-lint-ignore-file no-explicit-any
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const DEMO_TAG = "[DEMO]";

const DEMO_LEADS = [
  { nome_empresa: `${DEMO_TAG} Padaria Estrela do Sul`, telefone: "5511988880001", endereco: "Av. Paulista, 1000 - São Paulo/SP", site: "estrelapaes.com.br", rating: 4.7, reviews: 312, especialidades: "Padaria, Cafeteria" },
  { nome_empresa: `${DEMO_TAG} Auto Center Veloz`, telefone: "5511988880002", endereco: "R. Augusta, 500 - São Paulo/SP", site: "velozautocenter.com.br", rating: 4.5, reviews: 188, especialidades: "Mecânica, Funilaria" },
  { nome_empresa: `${DEMO_TAG} Clínica Sorrir+`, telefone: "5511988880003", endereco: "R. Oscar Freire, 200 - São Paulo/SP", site: "sorrirmais.com.br", rating: 4.9, reviews: 542, especialidades: "Odontologia" },
  { nome_empresa: `${DEMO_TAG} Studio Pilates Vital`, telefone: "5511988880004", endereco: "Av. Faria Lima, 3000 - São Paulo/SP", site: "studiovital.com.br", rating: 4.8, reviews: 256, especialidades: "Pilates, Fisioterapia" },
  { nome_empresa: `${DEMO_TAG} Pet Shop Quatro Patas`, telefone: "5511988880005", endereco: "R. Teodoro Sampaio, 1500 - São Paulo/SP", site: "4patas.com.br", rating: 4.6, reviews: 421, especialidades: "Pet Shop, Banho & Tosa" },
  { nome_empresa: `${DEMO_TAG} Restaurante Sabor Caseiro`, telefone: "5511988880006", endereco: "Av. Rebouças, 800 - São Paulo/SP", site: "saborcaseiro.com.br", rating: 4.4, reviews: 678, especialidades: "Restaurante" },
  { nome_empresa: `${DEMO_TAG} Academia ForçaTotal`, telefone: "5511988880007", endereco: "R. dos Pinheiros, 600 - São Paulo/SP", site: "forcatotal.com.br", rating: 4.7, reviews: 389, especialidades: "Academia, Crossfit" },
  { nome_empresa: `${DEMO_TAG} Salão Beleza Pura`, telefone: "5511988880008", endereco: "R. Haddock Lobo, 400 - São Paulo/SP", site: "belezapura.com.br", rating: 4.8, reviews: 512, especialidades: "Salão de Beleza" },
  { nome_empresa: `${DEMO_TAG} Escola Aprender +`, telefone: "5511988880009", endereco: "Av. Brigadeiro, 2000 - São Paulo/SP", site: "aprendermais.com.br", rating: 4.9, reviews: 234, especialidades: "Escola, Reforço" },
  { nome_empresa: `${DEMO_TAG} Imobiliária Casa Boa`, telefone: "5511988880010", endereco: "R. Bela Cintra, 900 - São Paulo/SP", site: "casaboa.com.br", rating: 4.5, reviews: 176, especialidades: "Imobiliária" },
  { nome_empresa: `${DEMO_TAG} Ótica Visão Clara`, telefone: "5511988880011", endereco: "R. 25 de Março, 100 - São Paulo/SP", site: "visaoclara.com.br", rating: 4.6, reviews: 298, especialidades: "Óticas" },
  { nome_empresa: `${DEMO_TAG} Lava-rápido Brilho Total`, telefone: "5511988880012", endereco: "Av. Sumaré, 700 - São Paulo/SP", site: "brilhototal.com.br", rating: 4.3, reviews: 145, especialidades: "Lava-Rápido" },
  { nome_empresa: `${DEMO_TAG} Floricultura Jardim Vivo`, telefone: "5511988880013", endereco: "R. Cardeal Arcoverde, 300 - São Paulo/SP", site: "jardimvivo.com.br", rating: 4.8, reviews: 367, especialidades: "Floricultura" },
  { nome_empresa: `${DEMO_TAG} Marcenaria Madeira Nobre`, telefone: "5511988880014", endereco: "R. Voluntários da Pátria, 1100 - São Paulo/SP", site: "madeiranobre.com.br", rating: 4.7, reviews: 89, especialidades: "Marcenaria" },
  { nome_empresa: `${DEMO_TAG} Costura Express`, telefone: "5511988880015", endereco: "R. Conselheiro Furtado, 200 - São Paulo/SP", site: "costuraexp.com.br", rating: 4.5, reviews: 67, especialidades: "Costura, Reformas" },
  { nome_empresa: `${DEMO_TAG} Despachante Ágil`, telefone: "5511988880016", endereco: "R. Líbero Badaró, 400 - São Paulo/SP", site: "despachanteagil.com.br", rating: 4.6, reviews: 234, especialidades: "Despachante" },
  { nome_empresa: `${DEMO_TAG} Confeitaria Doce Sonho`, telefone: "5511988880017", endereco: "R. Aspicuelta, 300 - São Paulo/SP", site: "docesonho.com.br", rating: 4.9, reviews: 612, especialidades: "Confeitaria" },
  { nome_empresa: `${DEMO_TAG} Estúdio Fotográfico Luz`, telefone: "5511988880018", endereco: "R. Mourato Coelho, 500 - São Paulo/SP", site: "estudioluz.com.br", rating: 4.8, reviews: 178, especialidades: "Fotografia" },
  { nome_empresa: `${DEMO_TAG} Eletrônica Tech Fast`, telefone: "5511988880019", endereco: "R. Santa Ifigênia, 200 - São Paulo/SP", site: "techfast.com.br", rating: 4.4, reviews: 423, especialidades: "Eletrônica, Conserto" },
  { nome_empresa: `${DEMO_TAG} Contabilidade Precisa`, telefone: "5511988880020", endereco: "Av. Paulista, 2500 - São Paulo/SP", site: "precisacontabil.com.br", rating: 4.9, reviews: 145, especialidades: "Contabilidade" },
];

const DEMO_CONVERSATIONS = [
  {
    telefone: "5511988880003", nome: `${DEMO_TAG} Clínica Sorrir+`, nome_contato: "Dra. Marina Silva", cargo: "Sócia-proprietária",
    qualified: true,
    messages: [
      { role: "assistant", content: "Oi Dra. Marina, tudo bem? Vi que a Clínica Sorrir+ tem 4.9 estrelas no Google — parabéns! Vocês captam novos pacientes hoje mais por indicação ou anúncios?" },
      { role: "user", content: "Oi! Hoje é mais indicação mesmo, anúncio a gente nunca conseguiu fazer dar certo." },
      { role: "assistant", content: "Faz sentido. Quando alguém entra em contato pelo Insta ou WhatsApp e ninguém responde rápido, isso costuma virar paciente perdido?" },
      { role: "user", content: "Direto. A gente perde umas 5 a 10 oportunidades por semana fácil porque a recepção não dá conta." },
      { role: "assistant", content: "Imagina recuperar 80% delas com uma IA que responde em 2 segundos, qualifica e já agenda na agenda das suas profissionais. Topa eu te mostrar como funciona numa call rápida amanhã?" },
      { role: "user", content: "Topo sim, manda o horário" },
    ],
  },
  {
    telefone: "5511988880007", nome: `${DEMO_TAG} Academia ForçaTotal`, nome_contato: "Rafael Costa", cargo: "Dono",
    qualified: false,
    messages: [
      { role: "assistant", content: "Fala Rafael, tudo bem? Vi a ForçaTotal aqui — 4.7 com quase 400 reviews, parabéns! Como vocês captam aluno novo hoje?" },
      { role: "user", content: "Boa, valeu! É mais panfleto e indicação." },
      { role: "assistant", content: "Quando chega lead pelo Direct ou WhatsApp, vocês conseguem responder em quanto tempo geralmente?" },
    ],
  },
  {
    telefone: "5511988880017", nome: `${DEMO_TAG} Confeitaria Doce Sonho`, nome_contato: "Carla Mendes", cargo: "Sócia",
    qualified: true,
    messages: [
      { role: "assistant", content: "Oi Carla! Vi a Doce Sonho com 4.9 e mais de 600 reviews — apaixonei. Hoje o forte de pedidos é balcão ou também encomenda via WhatsApp?" },
      { role: "user", content: "Oi! WhatsApp explodiu, mas a gente não dá conta de responder tudo." },
      { role: "assistant", content: "Entendi. Quando você não responde rápido, o cliente costuma sumir ou volta depois?" },
      { role: "user", content: "Some na hora. Já perdi muito pedido grande de empresa por isso." },
      { role: "assistant", content: "Faz total sentido. Se eu te mostrar uma IA que responde em segundos, mantém o tom da Doce Sonho e ainda registra o pedido, tu topa uma conversa de 20min?" },
      { role: "user", content: "Bora, hoje à tarde dá?" },
    ],
  },
  {
    telefone: "5511988880020", nome: `${DEMO_TAG} Contabilidade Precisa`, nome_contato: "Eduardo Lima", cargo: "Sócio-fundador",
    qualified: true,
    messages: [
      { role: "assistant", content: "Eduardo, boa tarde! Vi a Precisa com 4.9 — nichado em PMEs, certo? Como chegam novos clientes na contabilidade hoje?" },
      { role: "user", content: "Boa! Maioria é indicação, raramente alguém pesquisa." },
      { role: "assistant", content: "E quando aparece alguém pesquisando, o seguimento é rápido ou às vezes esfria?" },
      { role: "user", content: "Esfria. Estou perdendo lead bom porque ninguém aqui faz comercial direito." },
      { role: "assistant", content: "É exatamente isso que a gente resolve — IA SDR que prospecta e qualifica antes de chegar em você. 15min de call amanhã pra eu te mostrar?" },
      { role: "user", content: "Marca aí" },
    ],
  },
  {
    telefone: "5511988880010", nome: `${DEMO_TAG} Imobiliária Casa Boa`, nome_contato: "Patrícia Souza", cargo: "Gerente comercial",
    qualified: false,
    messages: [
      { role: "assistant", content: "Patrícia, tudo bem? Vi a Casa Boa aqui — como vocês captam comprador hoje, mais portal ou tráfego pago?" },
      { role: "user", content: "Tudo, ZAP, OLX, Instagram, indicação..." },
      { role: "assistant", content: "Quando o lead chega e o corretor não responde nos primeiros 5min, costuma virar venda mesmo assim?" },
    ],
  },
];

const PIPELINE_CARDS = [
  { nome_empresa: `${DEMO_TAG} Clínica Sorrir+`, contato: "Dra. Marina Silva", telefone: "5511988880003", email: "marina@sorrirmais.com.br", estagio: "prospectado", origem: "WhatsApp IA", valor_estimado: 9700, observacoes: "Quer reduzir leads perdidos. Reunião marcada amanhã 10h." },
  { nome_empresa: `${DEMO_TAG} Confeitaria Doce Sonho`, contato: "Carla Mendes", telefone: "5511988880017", email: "carla@docesonho.com.br", estagio: "negociando", origem: "WhatsApp IA", valor_estimado: 4700, observacoes: "Foco em encomendas corporativas — call hoje 16h." },
  { nome_empresa: `${DEMO_TAG} Contabilidade Precisa`, contato: "Eduardo Lima", telefone: "5511988880020", email: "edu@precisacontabil.com.br", estagio: "negociando", origem: "WhatsApp IA", valor_estimado: 14700, observacoes: "SDR para vender contabilidade — call amanhã 14h." },
];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false } }
    );
    const auth = req.headers.get("Authorization") ?? "";
    const jwt = auth.replace("Bearer ", "");
    const { data: userData } = await supabase.auth.getUser(jwt);
    const user = userData?.user;
    if (!user) return new Response(JSON.stringify({ error: "unauthenticated" }), { status: 401, headers: { ...cors, "Content-Type": "application/json" } });

    const body = await req.json().catch(() => ({}));
    const action = body.action ?? "seed";
    const uid = user.id;

    if (action === "clear") {
      // delete by demo tag — only this user's rows
      const tables = ["pipeline_cards", "scheduled_meetings", "qualification_conversations", "leads"];
      const counts: Record<string, number> = {};
      // pipeline_cards: nome_empresa
      const { count: pcCount } = await supabase.from("pipeline_cards").delete({ count: "exact" })
        .eq("user_id", uid).ilike("nome_empresa", `${DEMO_TAG}%`);
      counts.pipeline_cards = pcCount ?? 0;
      // scheduled_meetings: titulo
      const { count: smCount } = await supabase.from("scheduled_meetings").delete({ count: "exact" })
        .eq("user_id", uid).ilike("titulo", `${DEMO_TAG}%`);
      counts.scheduled_meetings = smCount ?? 0;
      // qualification_conversations (messages cascade)
      const { count: qcCount } = await supabase.from("qualification_conversations").delete({ count: "exact" })
        .eq("user_id", uid).ilike("nome", `${DEMO_TAG}%`);
      counts.qualification_conversations = qcCount ?? 0;
      // leads
      const { count: lCount } = await supabase.from("leads").delete({ count: "exact" })
        .eq("user_id", uid).ilike("nome_empresa", `${DEMO_TAG}%`);
      counts.leads = lCount ?? 0;
      return new Response(JSON.stringify({ ok: true, action: "clear", deleted: counts }), { headers: { ...cors, "Content-Type": "application/json" } });
    }

    // SEED
    const leadsRows = DEMO_LEADS.map((l) => ({ ...l, user_id: uid, disparo: "Sim", data_disparo: new Date().toISOString(), mensagem: `Olá ${l.nome_empresa.replace(DEMO_TAG, "").trim()}! ...` }));
    const { error: leadsErr } = await supabase.from("leads").upsert(leadsRows, { onConflict: "telefone,user_id" });
    if (leadsErr) throw leadsErr;

    // conversations + messages
    for (const conv of DEMO_CONVERSATIONS) {
      const { data: cRow, error: cErr } = await supabase.from("qualification_conversations").upsert({
        user_id: uid,
        telefone: conv.telefone,
        nome: conv.nome,
        nome_contato: conv.nome_contato,
        cargo: conv.cargo,
        qualified: conv.qualified,
        qualified_at: conv.qualified ? new Date().toISOString() : null,
        last_message_at: new Date().toISOString(),
        last_inbound_at: new Date().toISOString(),
        status: "active",
      }, { onConflict: "user_id,telefone" }).select("id").single();
      if (cErr) throw cErr;
      // wipe and re-insert messages
      await supabase.from("qualification_messages").delete().eq("conversation_id", cRow.id);
      const baseTs = Date.now() - conv.messages.length * 60_000;
      const msgs = conv.messages.map((m, i) => ({
        user_id: uid,
        conversation_id: cRow.id,
        telefone: conv.telefone,
        role: m.role,
        content: m.content,
        processed: true,
        created_at: new Date(baseTs + i * 60_000).toISOString(),
      }));
      const { error: mErr } = await supabase.from("qualification_messages").insert(msgs);
      if (mErr) throw mErr;
    }

    // pipeline cards (delete existing demo first to keep idempotent)
    await supabase.from("pipeline_cards").delete().eq("user_id", uid).ilike("nome_empresa", `${DEMO_TAG}%`);
    const cardsRows = PIPELINE_CARDS.map((c, i) => ({ ...c, user_id: uid, position: i }));
    const { error: pcErr } = await supabase.from("pipeline_cards").insert(cardsRows);
    if (pcErr) throw pcErr;

    // meeting
    await supabase.from("scheduled_meetings").delete().eq("user_id", uid).ilike("titulo", `${DEMO_TAG}%`);
    const startAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
    startAt.setHours(10, 0, 0, 0);
    const endAt = new Date(startAt.getTime() + 30 * 60 * 1000);
    await supabase.from("scheduled_meetings").insert({
      user_id: uid,
      lead_nome: `${DEMO_TAG} Clínica Sorrir+`,
      lead_telefone: "5511988880003",
      lead_email: "marina@sorrirmais.com.br",
      titulo: `${DEMO_TAG} Apresentação LeadsBooster — Clínica Sorrir+`,
      descricao: "Demonstração de IA SDR para captação de pacientes.",
      start_at: startAt.toISOString(),
      end_at: endAt.toISOString(),
      meet_link: "https://meet.google.com/demo-leads-booster",
      status: "scheduled",
    });

    return new Response(JSON.stringify({
      ok: true,
      action: "seed",
      created: {
        leads: DEMO_LEADS.length,
        conversations: DEMO_CONVERSATIONS.length,
        pipeline_cards: PIPELINE_CARDS.length,
        meetings: 1,
      },
    }), { headers: { ...cors, "Content-Type": "application/json" } });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e?.message ?? String(e) }), { status: 500, headers: { ...cors, "Content-Type": "application/json" } });
  }
});
