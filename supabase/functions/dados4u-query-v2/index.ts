import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const VALID_TYPES = ["cpf_cnpj", "nome", "telefone", "email"];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // === MULTI-TENANT AUTH ===
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ success: false, error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    // Fase L: aceita service role (auto-prospect cron) com user_id no query param.
    const _SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const _isServiceRole = authHeader === `Bearer ${_SERVICE_ROLE}`;
    let userId: string | undefined;
    if (_isServiceRole) {
      const _url = new URL(req.url);
      userId = _url.searchParams.get("user_id") ?? undefined;
      if (!userId) {
        return new Response(JSON.stringify({ success: false, error: "user_id query param obrigatório com service role" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    } else {
      const _userClient = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_ANON_KEY")!,
        { global: { headers: { Authorization: authHeader } } },
      );
      const _token = authHeader.replace("Bearer ", "");
      const { data: _claimsData } = await _userClient.auth.getClaims(_token);
      userId = (_claimsData?.claims?.sub) as string | undefined;
      if (!userId) {
        return new Response(JSON.stringify({ success: false, error: "Unauthorized" }), {
          status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }
    // === END MULTI-TENANT AUTH ===
    const { tipo, valor, leadId } = await req.json();

    if (!tipo || !valor) {
      return new Response(
        JSON.stringify({ success: false, error: "tipo e valor são obrigatórios" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    if (!VALID_TYPES.includes(tipo)) {
      return new Response(
        JSON.stringify({ success: false, error: `tipo deve ser um de: ${VALID_TYPES.join(", ")}` }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // DadosBooster substitui a API Dados4U (fora do ar). É o serviço do próprio
    // operador (proxy revalida.online + CNPJ.ws) e não exige API key por painel.
    // Base configurável via env DADOSBOOSTER_URL; default = app publicada.
    const DADOSBOOSTER_URL = (Deno.env.get("DADOSBOOSTER_URL") ?? "https://dadosbooster.lovable.app").replace(/\/+$/, "");

    const cleanValue = String(valor).trim();
    const digits = cleanValue.replace(/\D/g, "");

    // Mapeia o tipo do LeadsBooster (cpf_cnpj|nome|telefone|email) para o
    // endpoint do DadosBooster (cpf|cnpj|nome|celular|email).
    let dbType: string;
    let dbValor = cleanValue;
    if (tipo === "cpf_cnpj") {
      dbType = digits.length === 14 ? "cnpj" : "cpf";
      dbValor = digits;
    } else if (tipo === "telefone") {
      dbType = "celular";
      dbValor = digits;
    } else if (tipo === "email") {
      dbType = "email";
    } else {
      dbType = "nome";
    }

    console.log(`[dadosbooster] Consultando ${dbType}=${dbValor}`);

    const timeoutMs = dbType === "nome" ? 45000 : 30000;
    let apiResp: Response;
    try {
      const qs = new URLSearchParams({ type: dbType, valor: dbValor });
      apiResp = await fetch(`${DADOSBOOSTER_URL}/api/search?${qs.toString()}`, {
        method: "GET",
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (fetchError) {
      console.error("[dadosbooster] upstream timeout/error", fetchError);
      return new Response(
        JSON.stringify({ success: false, error: "DadosBooster demorou para responder. Tente novamente em alguns segundos." }),
        { status: 504, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const rawText = await apiResp.text();
    let envelope: any = {};
    try { envelope = rawText ? JSON.parse(rawText) : {}; } catch { envelope = { message: rawText }; }

    // Erro real do upstream (não é "não encontrado")
    if (envelope?.success === false && !envelope?.notFound) {
      return new Response(
        JSON.stringify({ success: false, error: envelope?.error || `Erro DadosBooster ${apiResp.status}`, upstreamStatus: apiResp.status, raw: envelope }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const rowsRaw: any[] = Array.isArray(envelope?.data)
      ? envelope.data
      : (envelope?.data && typeof envelope.data === "object") ? [envelope.data] : [];

    if (rowsRaw.length === 0) {
      return new Response(
        JSON.stringify({
          success: false,
          error: `Nenhum dado encontrado para ${tipo.toUpperCase()} "${cleanValue}". Tente outro termo ou verifique a grafia.`,
          notFound: true,
          upstreamStatus: apiResp.status,
          raw: envelope,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Registro primário = primeira linha. PF vem com campos MAIÚSCULOS
    // (revalida.online); PJ/CNPJ vem com campos minúsculos (CNPJ.ws). O getter
    // é case-insensitive e aceita múltiplos aliases para cobrir os dois.
    const row = rowsRaw[0] as Record<string, any>;
    const gi = (...keys: string[]): string | null => {
      for (const k of keys) {
        for (const cand of [k, k.toUpperCase(), k.toLowerCase()]) {
          const v = (row as any)[cand];
          if (v !== undefined && v !== null && String(v).trim() !== "") return String(v).trim();
        }
      }
      return null;
    };

    const celulares: any[] = [];
    const fixos: any[] = [];
    for (let n = 1; n <= 5; n++) {
      const c = gi(`CELULAR${n}`);
      if (c) { const d = c.replace(/\D/g, ""); if (d) celulares.push({ numero: d, situacao: null }); }
      const fx = gi(`TEL_FIXO${n}`);
      if (fx) { const d = fx.replace(/\D/g, ""); if (d) fixos.push({ numero: d, situacao: null }); }
    }
    // Telefones de PJ (CNPJ.ws)
    for (const k of ["ddd_telefone_1", "ddd_telefone_2"]) {
      const t = gi(k);
      if (t && t !== "0") { const d = t.replace(/\D/g, ""); if (d) celulares.push({ numero: d, situacao: "empresa" }); }
    }

    const emailVal = gi("EMAIL", "correio_eletronico");
    const emails = emailVal ? [{ email: emailVal }] : [];

    const endObj: Record<string, any> = {};
    const setEnd = (col: string, ...keys: string[]) => { const v = gi(...keys); if (v) endObj[col] = v; };
    setEnd("logradouro", "LOGRADOURO", "logradouro");
    setEnd("numero", "NUMERO", "numero");
    setEnd("complemento", "COMPLEMENTO", "complemento");
    setEnd("bairro", "BAIRRO", "bairro");
    setEnd("cidade", "CIDADE", "municipio");
    setEnd("uf", "UF", "uf");
    setEnd("cep", "CEP", "cep");
    const enderecos = Object.keys(endObj).length ? [endObj] : [];

    const flagObito = gi("FLAG_OBITO");
    const falecido = flagObito === "1" ? "SIM" : flagObito === "0" ? "NÃO" : null;
    // CNPJ.ws devolve situacao_cadastral numérico; PF devolve texto. Rotula o código.
    const SITUACAO_CNPJ: Record<string, string> = { "1": "NULA", "2": "ATIVA", "3": "SUSPENSA", "4": "INAPTA", "8": "BAIXADA" };
    const situacaoRaw = gi("STATUS_RECEITA_FEDERAL", "situacao_cadastral");
    const situacao = situacaoRaw && SITUACAO_CNPJ[situacaoRaw] ? SITUACAO_CNPJ[situacaoRaw] : situacaoRaw;
    const cpfClean = (gi("CPF") || "").replace(/\D/g, "") || null;
    const cnpjClean = (gi("CNPJ") || "").replace(/\D/g, "") || null;
    const renda = gi("RENDA_PRESUMIDA", "FAIXA_RENDA", "capital_social_empresa");

    console.log(`[dadosbooster] normalized: nome=${gi("NOME", "razao_social")} cels=${celulares.length} fixos=${fixos.length} emails=${emails.length} results=${rowsRaw.length}`);

    const { data: inserted, error: insertError } = await supabase
      .from("dados4u_consultas")
      .insert({ user_id: userId,
        tipo_consulta: tipo,
        valor_consultado: cleanValue,
        nome: gi("NOME", "razao_social", "nome_fantasia"),
        cpf: cpfClean,
        cnpj: cnpjClean,
        nascimento: gi("DT_NASCIMENTO", "data_inicio_atividade"),
        sexo: gi("SEXO"),
        nome_mae: gi("NOME_MAE"),
        falecido,
        situacao,
        ocupacao: gi("CBO", "cnae_fiscal"),
        renda,
        risco: null,
        celulares,
        fixos,
        emails,
        enderecos,
        sociedades: [],
        raw_response: envelope,
        tokens_gastos: null,
        lead_id: leadId ?? null,
      })
      .select()
      .single();

    if (insertError) {
      console.error("[dadosbooster] insert error", insertError);
      return new Response(
        JSON.stringify({ success: false, error: `Falha ao salvar consulta: ${insertError.message}` }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    return new Response(
      JSON.stringify({ success: true, consulta: inserted, raw: envelope, total: envelope?.total ?? rowsRaw.length, results: rowsRaw.length }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error) {
    console.error("[dados4u] error", error);
    return new Response(
      JSON.stringify({ success: false, error: (error as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});