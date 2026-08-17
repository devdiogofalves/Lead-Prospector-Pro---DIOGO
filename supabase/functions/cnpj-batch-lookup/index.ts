import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

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
    const { leadIds } = await req.json();

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get leads that have CNPJ but not yet validated
    let query = supabase
      .from("leads")
      .select("id, nome_empresa, telefone, endereco, site, rating, reviews, cnpj")
      .eq("user_id", userId)
      .eq("cnpj_validado", false)
      .not("cnpj", "is", null);

    if (leadIds?.length) {
      query = query.in("id", leadIds);
    }

    const { data: leads, error: fetchError } = await query.limit(50);
    if (fetchError) throw fetchError;

    if (!leads || leads.length === 0) {
      return new Response(
        JSON.stringify({ success: true, processed: 0, message: "Nenhum lead com CNPJ pendente de validação." }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Processing ${leads.length} leads for CNPJ lookup`);

    let processed = 0;
    let errors: string[] = [];

    for (const lead of leads) {
      const cleanCnpj = (lead.cnpj || "").replace(/\D/g, "");
      if (cleanCnpj.length !== 14) {
        errors.push(`${lead.nome_empresa}: CNPJ inválido`);
        continue;
      }

      try {
        // Rate limit: wait 1.1s between requests (CNPJ.ws free limit)
        if (processed > 0) {
          await new Promise((r) => setTimeout(r, 1100));
        }

        const response = await fetch(`https://publica.cnpj.ws/cnpj/${cleanCnpj}`);

        if (response.status === 429) {
          errors.push(`${lead.nome_empresa}: Rate limit - tente novamente em 1 minuto`);
          break; // Stop processing
        }

        if (response.status === 404) {
          errors.push(`${lead.nome_empresa}: CNPJ não encontrado`);
          continue;
        }

        if (!response.ok) {
          errors.push(`${lead.nome_empresa}: Erro ${response.status}`);
          continue;
        }

        const data = await response.json();

        const razaoSocial = data.razao_social || "";
        const nomeFantasia = data.estabelecimento?.nome_fantasia || "";
        const porte = data.porte?.descricao || "";
        const naturezaJuridica = data.natureza_juridica?.descricao || "";
        const atividadePrincipal = data.estabelecimento?.atividade_principal?.descricao || "";
        const situacao = data.estabelecimento?.situacao_cadastral || "";

        const socios = (data.socios || [])
          .map((s: any) => `${s.nome || ""} (${s.qualificacao_socio?.descricao || ""})`)
          .join("; ");

        const est = data.estabelecimento || {};
        const endereco = [est.logradouro, est.numero, est.complemento, est.bairro, est.cidade?.nome, est.estado?.sigla, est.cep]
          .filter(Boolean).join(", ");
        const email = est.email || null;

        // Update lead
        await supabase
          .from("leads")
          .update({
            razao_social: razaoSocial,
            porte,
            natureza_juridica: naturezaJuridica,
            socios,
            cnpj_validado: true,
          })
          .eq("id", lead.id);

        // Upsert into empresas_enriquecidas
        await supabase
          .from("empresas_enriquecidas")
          .upsert({ user_id: userId,
            lead_id: lead.id,
            fonte: "google_maps",
            nome_empresa: nomeFantasia || razaoSocial || lead.nome_empresa,
            telefone: lead.telefone,
            endereco: endereco || lead.endereco,
            site: lead.site,
            rating: lead.rating,
            reviews: lead.reviews,
            cnpj: cleanCnpj,
            razao_social: razaoSocial,
            nome_fantasia: nomeFantasia,
            porte,
            natureza_juridica: naturezaJuridica,
            socios,
            atividade_principal: atividadePrincipal,
            email,
            situacao,
          }, { onConflict: "cnpj,user_id" });

        processed++;
        console.log(`✓ ${lead.nome_empresa} - CNPJ validated`);
      } catch (err) {
        errors.push(`${lead.nome_empresa}: ${err.message}`);
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        total: leads.length,
        processed,
        errors: errors.length > 0 ? errors : undefined,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Batch CNPJ error:", error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
