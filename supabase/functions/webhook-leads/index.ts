import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface LeadData {
  nome_empresa: string;
  telefone: string;
  endereco?: string;
  website?: string;
  rating?: number;
  reviews?: number;
  especialidades?: string;
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Auth: JWT do usuário OU service role com user_id no query param
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ success: false, error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const _isServiceRole = authHeader === `Bearer ${supabaseServiceKey}`;
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
      const userClient = createClient(
        supabaseUrl,
        Deno.env.get("SUPABASE_ANON_KEY")!,
        { global: { headers: { Authorization: authHeader } } },
      );
      const token = authHeader.replace("Bearer ", "");
      const { data: claims } = await userClient.auth.getClaims(token);
      userId = claims?.claims?.sub;
      if (!userId) {
        return new Response(JSON.stringify({ success: false, error: "Unauthorized" }), {
          status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const body = await req.json();
    console.log("Webhook received:", JSON.stringify(body));

    // Support both single lead and array of leads
    const leads: LeadData[] = Array.isArray(body) ? body : body.body ? body.body : [body];

    const results = [];
    const errors = [];

    for (const lead of leads) {
      // Clean phone number - remove non-digits and ensure it starts with 55
      let telefone = String(lead.telefone || "").replace(/\D/g, "");
      if (!telefone.startsWith("55") && telefone.length >= 10) {
        telefone = `55${telefone}`;
      }

      if (!telefone || !lead.nome_empresa) {
        console.log("Skipping lead - missing required fields:", lead);
        errors.push({ lead, error: "Missing required fields (telefone or nome_empresa)" });
        continue;
      }

      const leadData = {
        user_id: userId,
        nome_empresa: lead.nome_empresa,
        telefone: telefone,
        endereco: lead.endereco || null,
        site: lead.website || null,
        rating: lead.rating ? parseFloat(String(lead.rating)) : null,
        reviews: lead.reviews ? parseInt(String(lead.reviews)) : null,
        especialidades: lead.especialidades || null,
        disparo: "Não",
      };

      console.log("Inserting lead:", JSON.stringify(leadData));

      // Upsert to handle duplicates by phone
      const { data, error } = await supabase
        .from("leads")
        .upsert(leadData, { 
          onConflict: "telefone,user_id",
          ignoreDuplicates: false 
        })
        .select()
        .single();

      if (error) {
        console.error("Error inserting lead:", error);
        errors.push({ lead: leadData, error: error.message });
      } else {
        console.log("Lead inserted successfully:", data);
        results.push(data);
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        inserted: results.length,
        errorsCount: errors.length,
        results,
        errorDetails: errors.length > 0 ? errors : undefined,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error("Webhook error:", error);
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
