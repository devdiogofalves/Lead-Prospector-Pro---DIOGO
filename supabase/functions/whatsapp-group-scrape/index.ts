// Captação de leads via grupos WhatsApp (Mandrack Studio).
// Lista grupos do chip ativo e extrai participantes pra public.whatsapp_group_leads.
//
// POST body:
//   { action: "list-groups" }                       → retorna grupos do chip
//   { action: "scrape", group_jids: ["...@g.us"] }  → raspa membros e grava
//   { action: "scrape-all" }                        → raspa todos os grupos

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

const pickFirstString = (...values: unknown[]) =>
  values.map((v) => (v == null ? "" : String(v).trim())).find(Boolean) ?? "";

const onlyDigits = (value: unknown) => String(value ?? "").replace(/@.*$/, "").replace(/\D/g, "");

function validPhoneFrom(...values: unknown[]) {
  for (const value of values) {
    const raw = String(value ?? "");
    if (!raw || raw.includes("@lid") || raw.endsWith("@g.us")) continue;
    const digits = onlyDigits(raw);
    if (digits.length >= 10 && digits.length <= 15) return digits;
  }
  return null;
}

function extractMembers(body: any) {
  const b = body?.data ?? body?.results ?? body ?? {};
  const members =
    (Array.isArray(b?.Participants) && b.Participants) ||
    (Array.isArray(b?.participants) && b.participants) ||
    (Array.isArray(b?.members) && b.members) ||
    (Array.isArray(b?.users) && b.users) ||
    (Array.isArray(body?.results?.participants) && body.results.participants) ||
    (Array.isArray(body?.data?.participants) && body.data.participants) ||
    (Array.isArray(body?.data?.Participants) && body.data.Participants) ||
    [];
  const groupName = pickFirstString(
    b.GroupName, b.group_name, b.name, b.subject, b.title,
    body?.results?.name, body?.data?.name,
  );
  return { groupName, members: Array.isArray(members) ? members : [] };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const auth = req.headers.get("Authorization") ?? "";
    if (!auth.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);
    const SUPA = Deno.env.get("SUPABASE_URL")!;
    const SR = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const userClient = createClient(SUPA, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: auth } },
    });
    const { data: u } = await userClient.auth.getUser();
    const userId = u?.user?.id;
    if (!userId) return json({ error: "Unauthenticated" }, 401);
    const admin = createClient(SUPA, SR);

    const body = await req.json().catch(() => ({} as any));
    const action = body.action ?? "list-groups";

    // Chip ativo (1º criado)
    const { data: inst } = await admin
      .from("whatsapp_instances")
      .select("mandrack_instance_token, instance_name")
      .eq("user_id", userId)
      .eq("active", true)
      .order("created_at", { ascending: true })
      .limit(1).maybeSingle();
    if (!inst?.mandrack_instance_token) {
      return json({ error: "Nenhum chip WhatsApp ativo. Conecte um chip em Integrações → WhatsApp." }, 400);
    }

    let MAND = (Deno.env.get("MANDRACK_URL") ?? "https://api.mandrackstudio.ia.br").trim().replace(/\/$/, "");
    if (!/^https?:\/\//i.test(MAND)) MAND = `https://${MAND}`;

    async function call(path: string, init: RequestInit = {}) {
      const r = await fetch(`${MAND}${path}`, {
        ...init,
        headers: {
          "Content-Type": "application/json",
          "token": inst!.mandrack_instance_token!,
          ...(init.headers || {}),
        },
      });
      const t = await r.text();
      let b: any = t; try { b = JSON.parse(t); } catch {}
      return { ok: r.ok, status: r.status, body: b };
    }

    if (action === "list-groups") {
      for (const sp of ["/group/sync", "/group/refresh", "/group/fetchAll"]) {
        await call(sp, { method: "POST" }).catch(() => null);
      }
      const r = await call(`/group/list`, { method: "GET" });
      const raw = r.body?.data?.groups ?? r.body?.groups ?? r.body?.data ?? [];
      const groups = (Array.isArray(raw) ? raw : []).map((g: any) => ({
        jid: String(g.jid ?? g.id ?? g.remoteJid ?? g.groupJid ?? ""),
        name: String(g.name ?? g.subject ?? g.title ?? ""),
        size: g.size ?? g.participants?.length ?? null,
      })).filter((g: any) => g.jid.endsWith("@g.us"));
      return json({ groups });
    }

    // Resolve lista de grupos alvo
    let targetJids: string[] = [];
    if (action === "scrape-all") {
      const r = await call(`/group/list`, { method: "GET" });
      const raw = r.body?.data?.groups ?? r.body?.groups ?? r.body?.data ?? [];
      targetJids = (Array.isArray(raw) ? raw : []).map((g: any) =>
        String(g.jid ?? g.id ?? g.remoteJid ?? g.groupJid ?? "")
      ).filter((j: string) => j.endsWith("@g.us"));
    } else if (action === "scrape") {
      targetJids = Array.isArray(body.group_jids) ? body.group_jids.map(String) : [];
    } else {
      return json({ error: "action inválido" }, 400);
    }
    if (targetJids.length === 0) return json({ error: "nenhum grupo selecionado" }, 400);

    let totalMembers = 0;
    let totalSaved = 0;
    const perGroup: any[] = [];

    const sessionName = inst.instance_name || "";

    // Resolve um @lid -> número real via WAHA-compat (/waha/api/{session}/lids/{lid}).
    // Mandrack expõe esse endpoint (descoberto na doc oficial /docs/). Cache em memória
    // pra não martelar a API quando o mesmo lid aparecer em vários grupos.
    const lidCache = new Map<string, string | null>();
    async function resolveLid(lid: string): Promise<string | null> {
      if (!lid || !lid.includes("@lid")) return null;
      if (lidCache.has(lid)) return lidCache.get(lid)!;
      const lidKey = lid.split("@")[0];
      let phone: string | null = null;
      for (const path of [
        `/waha/api/${encodeURIComponent(sessionName)}/lids/${encodeURIComponent(lidKey)}`,
        `/waha/api/${encodeURIComponent(sessionName)}/lids/${encodeURIComponent(lid)}`,
      ]) {
        const r = await call(path, { method: "GET" }).catch(() => null);
        if (!r?.ok) continue;
        const b: any = r.body ?? {};
        const candidate = pickFirstString(
          b.pn, b.PN, b.phoneNumber, b.phone_number, b.phone, b.number,
          b.data?.pn, b.data?.phoneNumber, b.data?.phone, b.results?.pn,
          b.id, b.data?.id,
        );
        phone = validPhoneFrom(candidate);
        if (phone) break;
      }
      lidCache.set(lid, phone);
      return phone;
    }

    for (const jid of targetJids) {
      let members: any[] = [];
      let groupName = "";
      let bestPhoneCount = -1;
      let lastStatus: number | string = "?";
      // /waha/api/{session}/groups/{id}/participants/v2 já devolve PN resolvido em
      // muitos casos (endpoint v2 oficial). Mantemos fallback para os endpoints antigos.
      const endpoints = [
        `/waha/api/${encodeURIComponent(sessionName)}/groups/${encodeURIComponent(jid)}/participants/v2`,
        `/waha/api/${encodeURIComponent(sessionName)}/groups/${encodeURIComponent(jid)}`,
        `/group/participants?group_id=${encodeURIComponent(jid)}`,
        `/group/info?groupJID=${encodeURIComponent(jid)}`,
        `/group/info?GroupJID=${encodeURIComponent(jid)}`,
      ];
      for (const endpoint of endpoints) {
        const r = await call(endpoint, { method: "GET" }).catch(() => null);
        lastStatus = r?.status ?? "?";
        if (!r?.ok) {
          console.error("group endpoint failed", endpoint, r?.status, JSON.stringify(r?.body).slice(0, 300));
          continue;
        }
        const extracted = extractMembers(r.body);
        const phoneCount = extracted.members.filter((m: any) => validPhoneFrom(
          m.PhoneNumber, m.phone_number, m.phoneNumber, m.phone, m.number, m.whatsapp,
          m.pn, m.PN, m.JID, m.jid, m.id, m.remoteJid, m.participantJid,
        )).length;
        if (
          extracted.members.length > 0 &&
          (phoneCount > bestPhoneCount || (phoneCount === bestPhoneCount && extracted.members.length > members.length))
        ) {
          bestPhoneCount = phoneCount;
          members = extracted.members;
          groupName = extracted.groupName || groupName;
        }
      }
      if (members.length === 0) {
        perGroup.push({ jid, saved: 0, reason: `sem participantes (status=${lastStatus}). Você precisa ser admin do grupo para ver todos os membros.` });
        continue;
      }
      totalMembers += members.length;

      let privateOnly = 0;
      let withPhone = 0;
      let resolvedFromLid = 0;
      let skippedInvalid = 0;
      const uniqueRows = new Map<string, any>();
      for (const m of members) {
        const phoneJid = pickFirstString(
          m.pn, m.PN, m.PhoneNumber, m.phone_number, m.phoneNumber,
          m.phone_number_id, m.phone, m.number, m.whatsapp,
        );
        const rawJid = pickFirstString(m.JID, m.jid, m.id, m.remoteJid, m.participantJid, m.participant_jid, m.lid);
        let validPhone = validPhoneFrom(phoneJid, rawJid, m.phone, m.number, m.whatsapp);

        // Se só veio @lid, tenta resolver via /waha/api/{session}/lids/{lid}
        if (!validPhone && rawJid.includes("@lid")) {
          const resolved = await resolveLid(rawJid);
          if (resolved) {
            validPhone = resolved;
            resolvedFromLid++;
          }
        }

        const memberJid = rawJid || phoneJid || (validPhone ? `${validPhone}@s.whatsapp.net` : "");
        if (!memberJid) { skippedInvalid++; continue; }
        const pushname = pickFirstString(
          m.display_name, m.displayName, m.pushname, m.PushName, m.notify, m.name,
          m.verifiedName, m.shortName, m.Contact?.PushName, m.Contact?.FullName,
        ) || (validPhone ? null : "Participante privado");
        if (validPhone) withPhone++;
        else privateOnly++;
        uniqueRows.set(memberJid, {
          user_id: userId,
          group_jid: jid,
          group_name: groupName || null,
          member_jid: memberJid,
          phone: validPhone,
          pushname,
        });
      }
      const rows = Array.from(uniqueRows.values());

      if (rows.length === 0) {
        perGroup.push({ jid, saved: 0, reason: `${skippedInvalid} participantes vieram sem identificador utilizável.` });
        continue;
      }

      const { error: upErr, count } = await admin
        .from("whatsapp_group_leads")
        .upsert(rows, { onConflict: "user_id,group_jid,member_jid", count: "exact" });
      if (upErr) perGroup.push({ jid, saved: 0, error: upErr.message });
      else {
        const processed = count ?? rows.length;
        totalSaved += processed;
        perGroup.push({
          jid, group_name: groupName, saved: processed,
          with_phone: withPhone, resolved_from_lid: resolvedFromLid,
          private_only: privateOnly, skipped_invalid: skippedInvalid,
        });
      }
    }


    const savedPhone = perGroup.reduce((sum, g) => sum + (g.with_phone ?? 0), 0);
    const savedPrivate = perGroup.reduce((sum, g) => sum + (g.private_only ?? 0), 0);
    return json({ ok: true, groups: targetJids.length, members: totalMembers, saved: totalSaved, saved_phone: savedPhone, saved_private: savedPrivate, detail: perGroup });
  } catch (e: any) {
    return json({ error: String(e?.message ?? e) }, 500);
  }
});
