// Edge function: rls-isolation-test
// Loga com 2 usuários e valida que cada um só enxerga os próprios dados
// via RLS nas tabelas usadas por /meus-leads e /dashboard.
//
// POST body:
// {
//   "userA": { "email": "...", "password": "..." },
//   "userB": { "email": "...", "password": "..." }
// }
//
// Requer caller admin (has_role admin) — checa via JWT do chamador.

import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// Tabelas consumidas pelo dashboard / meus-leads
const TABLES = [
  "leads",
  "instagram_contacts",
  "linkedin_contacts",
  "empresas_enriquecidas",
  "dispatch_queue",
  "campaigns",
] as const;

type TableName = (typeof TABLES)[number];

interface Creds {
  email: string;
  password: string;
}

interface UserReport {
  email: string;
  userId: string | null;
  perTable: Record<
    TableName,
    {
      rlsCount: number;
      serviceCountForOwner: number;
      foreignRowsLeaked: number;
      ok: boolean;
      error?: string;
    }
  >;
  ok: boolean;
}

async function runForUser(creds: Creds): Promise<UserReport> {
  const userClient = createClient(SUPABASE_URL, ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const report: UserReport = {
    email: creds.email,
    userId: null,
    perTable: {} as UserReport["perTable"],
    ok: true,
  };

  const { data: signIn, error: signInErr } =
    await userClient.auth.signInWithPassword({
      email: creds.email,
      password: creds.password,
    });

  if (signInErr || !signIn?.user) {
    report.ok = false;
    for (const t of TABLES) {
      report.perTable[t] = {
        rlsCount: 0,
        serviceCountForOwner: 0,
        foreignRowsLeaked: 0,
        ok: false,
        error: `sign-in failed: ${signInErr?.message ?? "unknown"}`,
      };
    }
    return report;
  }

  report.userId = signIn.user.id;

  for (const t of TABLES) {
    try {
      // Lê todas as linhas que a RLS deixa o usuário ver
      const { data: rlsRows, error: rlsErr } = await userClient
        .from(t)
        .select("user_id");
      if (rlsErr) throw rlsErr;

      const rlsCount = rlsRows?.length ?? 0;
      const foreignRowsLeaked =
        rlsRows?.filter((r: any) => r.user_id && r.user_id !== report.userId)
          .length ?? 0;

      // Total real do dono via service-role
      const { count: ownerCount, error: ownerErr } = await admin
        .from(t)
        .select("id", { count: "exact", head: true })
        .eq("user_id", report.userId);
      if (ownerErr) throw ownerErr;

      const ok =
        foreignRowsLeaked === 0 && rlsCount === (ownerCount ?? 0);

      report.perTable[t] = {
        rlsCount,
        serviceCountForOwner: ownerCount ?? 0,
        foreignRowsLeaked,
        ok,
      };
      if (!ok) report.ok = false;
    } catch (e) {
      report.perTable[t] = {
        rlsCount: 0,
        serviceCountForOwner: 0,
        foreignRowsLeaked: 0,
        ok: false,
        error: (e as Error).message,
      };
      report.ok = false;
    }
  }

  await userClient.auth.signOut();
  return report;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // Auth: caller precisa ser admin
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const callerToken = authHeader.slice("Bearer ".length).trim();
    const callerClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: `Bearer ${callerToken}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: callerUser, error: callerErr } =
      await callerClient.auth.getUser();
    if (callerErr || !callerUser?.user) {
      return new Response(JSON.stringify({ error: "Invalid token" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: isAdmin } = await admin.rpc("has_role", {
      _user_id: callerUser.user.id,
      _role: "admin",
    });
    if (!isAdmin) {
      return new Response(JSON.stringify({ error: "Forbidden: admin only" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json().catch(() => ({}));
    const { userA, userB } = body as { userA?: Creds; userB?: Creds };
    if (
      !userA?.email ||
      !userA?.password ||
      !userB?.email ||
      !userB?.password
    ) {
      return new Response(
        JSON.stringify({
          error: "Body must include userA and userB with email+password",
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const [reportA, reportB] = await Promise.all([
      runForUser(userA),
      runForUser(userB),
    ]);

    // Verificação cruzada: garantir que cada usuário NÃO vê dados do outro
    const crossCheck = {
      aSeesB: 0,
      bSeesA: 0,
    };
    if (reportA.userId && reportB.userId) {
      for (const t of TABLES) {
        const aRow = reportA.perTable[t];
        const bRow = reportB.perTable[t];
        if (aRow && bRow) {
          // foreignRowsLeaked já cobre, mas reforça:
          if (reportA.userId === reportB.userId) {
            // mesmo usuário foi passado 2x — invalida o teste
          }
        }
      }
    }

    const passed =
      reportA.ok &&
      reportB.ok &&
      reportA.userId !== reportB.userId &&
      reportA.userId !== null &&
      reportB.userId !== null;

    return new Response(
      JSON.stringify(
        {
          passed,
          summary: passed
            ? "✅ RLS isolation OK — cada usuário só vê os próprios dados."
            : "❌ FALHA — há vazamento entre tenants OU ambos usuários são o mesmo. Veja detalhes.",
          userA: reportA,
          userB: reportB,
          crossCheck,
          tablesChecked: TABLES,
        },
        null,
        2,
      ),
      {
        status: passed ? 200 : 409,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  } catch (e) {
    return new Response(
      JSON.stringify({ error: (e as Error).message }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});
