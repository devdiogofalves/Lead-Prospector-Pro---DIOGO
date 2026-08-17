import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
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
    const _userClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const _token = authHeader.replace("Bearer ", "");
    const { data: _claimsData } = await _userClient.auth.getClaims(_token);
    const userId = (_claimsData?.claims?.sub) as string | undefined;
    if (!userId) {
      return new Response(JSON.stringify({ success: false, error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    // === END MULTI-TENANT AUTH ===
    const { cnpj, leadId } = await req.json();

    if (!cnpj) {
      return new Response(
        JSON.stringify({ success: false, error: "CNPJ é obrigatório" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Clean CNPJ - only digits
    const cleanCnpj = cnpj.replace(/\D/g, "");

    if (cleanCnpj.length !== 14) {
      return new Response(
        JSON.stringify({ success: false, error: "CNPJ deve ter 14 dígitos" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Looking up CNPJ: ${cleanCnpj}`);

    // Query CNPJ.ws public API
    const response = await fetch(`https://publica.cnpj.ws/cnpj/${cleanCnpj}`);

    if (response.status === 429) {
      return new Response(
        JSON.stringify({ success: false, error: "Limite de consultas atingido. Aguarde 1 minuto e tente novamente." }),
        { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (response.status === 404) {
      return new Response(
        JSON.stringify({ success: false, error: "CNPJ não encontrado na base da Receita Federal" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!response.ok) {
      throw new Error(`CNPJ.ws API error: ${response.status}`);
    }

    const data = await response.json();
    console.log("CNPJ data received:", JSON.stringify(data).substring(0, 500));

    // Extract relevant data
    const razaoSocial = data.razao_social || "";
    const nomeFantasia = data.estabelecimento?.nome_fantasia || "";
    const porte = data.porte?.descricao || "";
    const naturezaJuridica = data.natureza_juridica?.descricao || "";
    
    // Extract partners/owners
    const socios = (data.socios || [])
      .map((s: any) => {
        const nome = s.nome || "";
        const qualificacao = s.qualificacao_socio?.descricao || "";
        return `${nome} (${qualificacao})`;
      })
      .join("; ");

    // Extract address
    const est = data.estabelecimento || {};
    const endereco = [
      est.logradouro,
      est.numero,
      est.complemento,
      est.bairro,
      est.cidade?.nome,
      est.estado?.sigla,
      est.cep,
    ]
      .filter(Boolean)
      .join(", ");

    // Extract contact info
    const telefone1 = est.ddd1 && est.telefone1 ? `(${est.ddd1}) ${est.telefone1}` : null;
    const email = est.email || null;
    const site = est.tipo_logradouro || null; // not available in public API

    const cnpjData = {
      cnpj: cleanCnpj,
      razao_social: razaoSocial,
      nome_fantasia: nomeFantasia,
      porte,
      natureza_juridica: naturezaJuridica,
      socios,
      endereco,
      telefone: telefone1,
      email,
      situacao: est.situacao_cadastral || "",
      atividade_principal: data.estabelecimento?.atividade_principal?.descricao || "",
    };

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // If leadId provided, update the existing lead
    if (leadId) {
      // SEGURANÇA: scope por user_id previne IDOR (enriquecer lead de outro tenant)
      const { error: updateError } = await supabase
        .from("leads")
        .update({
          cnpj: cleanCnpj,
          razao_social: razaoSocial,
          porte,
          natureza_juridica: naturezaJuridica,
          socios,
          cnpj_validado: true,
        })
        .eq("id", leadId)
        .eq("user_id", userId);

      if (updateError) {
        console.error("Error updating lead:", updateError);
      }

      // Get lead data for empresas_enriquecidas
      const { data: leadData } = await supabase
        .from("leads")
        .select("nome_empresa, telefone, endereco, site, rating, reviews")
        .eq("id", leadId)
        .eq("user_id", userId)
        .maybeSingle();

      // Upsert into empresas_enriquecidas
      await supabase
        .from("empresas_enriquecidas")
        .upsert({ user_id: userId,
          lead_id: leadId,
          fonte: "google_maps",
          nome_empresa: nomeFantasia || razaoSocial || leadData?.nome_empresa || "",
          telefone: leadData?.telefone || telefone1,
          endereco: endereco || leadData?.endereco,
          site: leadData?.site,
          rating: leadData?.rating,
          reviews: leadData?.reviews,
          cnpj: cleanCnpj,
          razao_social: razaoSocial,
          nome_fantasia: nomeFantasia,
          porte,
          natureza_juridica: naturezaJuridica,
          socios,
          atividade_principal: cnpjData.atividade_principal,
          email,
          situacao: cnpjData.situacao,
        }, { onConflict: "cnpj,user_id" });
    }

    // If no leadId, save as new lead — mas DEDUP antes: se já existe lead com o
    // mesmo telefone OU mesmo CNPJ pra este user, atualiza ao invés de duplicar.
    let insertedLead: { id: string } | null = null;
    if (!leadId && telefone1) {
      const cleanTelefone = telefone1.replace(/\D/g, "");
      const { data: existing } = await supabase
        .from("leads")
        .select("id")
        .eq("user_id", userId)
        .or(`telefone.eq.${cleanTelefone},cnpj.eq.${cleanCnpj}`)
        .limit(1)
        .maybeSingle();

      if (existing?.id) {
        // Atualiza lead existente em vez de criar duplicado
        const { error: updateError } = await supabase
          .from("leads")
          .update({
            nome_empresa: nomeFantasia || razaoSocial,
            telefone: cleanTelefone,
            endereco,
            cnpj: cleanCnpj,
            razao_social: razaoSocial,
            porte,
            natureza_juridica: naturezaJuridica,
            socios,
            cnpj_validado: true,
          })
          .eq("id", existing.id);
        if (updateError) {
          console.error("Error updating dedup lead:", updateError);
        } else {
          insertedLead = { id: existing.id };
        }
      } else {
        const { data: created, error: insertError } = await supabase
          .from("leads")
          .insert({ user_id: userId,
            nome_empresa: nomeFantasia || razaoSocial,
            telefone: cleanTelefone,
            endereco,
            cnpj: cleanCnpj,
            razao_social: razaoSocial,
            porte,
            natureza_juridica: naturezaJuridica,
            socios,
            cnpj_validado: true,
          })
          .select("id")
          .maybeSingle();
        if (insertError) {
          console.error("Error inserting lead:", insertError);
        } else {
          insertedLead = created as { id: string } | null;
        }
      }

      // Also save to empresas_enriquecidas
      await supabase
        .from("empresas_enriquecidas")
        .upsert({ user_id: userId,
          lead_id: insertedLead?.id || null,
          fonte: "cnpj_direto",
          nome_empresa: nomeFantasia || razaoSocial,
          telefone: telefone1.replace(/\D/g, ""),
          endereco,
          cnpj: cleanCnpj,
          razao_social: razaoSocial,
          nome_fantasia: nomeFantasia,
          porte,
          natureza_juridica: naturezaJuridica,
          socios,
          atividade_principal: cnpjData.atividade_principal,
          email,
          situacao: cnpjData.situacao,
        }, { onConflict: "cnpj,user_id" });
    }

    return new Response(
      JSON.stringify({ success: true, data: cnpjData }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("CNPJ lookup error:", error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
