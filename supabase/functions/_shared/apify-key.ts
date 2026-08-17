// Resolve a chave Apify do painel do assinante seguindo a mesma precedência do
// resolveDados4uKey (dados4u-query-v2): chave própria do usuário → toggle de
// compartilhamento do admin (admin_shared_apis) → chave do admin.
//
// Usa o client `admin` (service_role) com o userId explícito de propósito: o RPC
// get_apify_key_for_user depende de auth.uid() e retorna NULL quando chamado por
// service_role (worker/cron), então não ativaria o toggle do admin. Este helper
// resolve de forma determinística independente do contexto de auth.
//
// Retorna "" quando nada está configurado — o caller decide se cai no
// APIFY_API_KEY global (env) como último recurso.
export async function resolveApifyKey(admin: any, userId: string): Promise<string> {
  const { data: ownKey } = await admin
    .from("user_api_keys")
    .select("api_key")
    .eq("user_id", userId)
    .eq("provider", "apify")
    .maybeSingle();

  const own = String(ownKey?.api_key ?? "").trim();
  if (own) return own;

  const { data: shared } = await admin
    .from("admin_shared_apis")
    .select("enabled")
    .eq("client_id", userId)
    .eq("provider", "apify")
    .eq("enabled", true)
    .maybeSingle();

  if (shared?.enabled) {
    const { data: adminRole } = await admin
      .from("user_roles")
      .select("user_id")
      .eq("role", "admin")
      .limit(1)
      .maybeSingle();

    if (adminRole?.user_id) {
      const { data: adminKey } = await admin
        .from("user_api_keys")
        .select("api_key")
        .eq("user_id", adminRole.user_id)
        .eq("provider", "apify")
        .maybeSingle();

      const sharedKey = String(adminKey?.api_key ?? "").trim();
      if (sharedKey) return sharedKey;
    }
  }

  return "";
}
