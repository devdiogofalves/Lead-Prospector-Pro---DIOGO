import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

async function getValidToken(admin: any, userId: string) {
  const { data: row, error } = await admin.from("google_calendar_tokens").select("*").eq("user_id", userId).maybeSingle();
  if (error) throw new Error(error.message);
  if (!row) throw new Error("Conta Google não conectada");

  if (new Date(row.expires_at).getTime() > Date.now() + 30000) return row;

  // refresh
  const params = new URLSearchParams({
    client_id: Deno.env.get("GOOGLE_OAUTH_CLIENT_ID")!,
    client_secret: Deno.env.get("GOOGLE_OAUTH_CLIENT_SECRET")!,
    refresh_token: row.refresh_token,
    grant_type: "refresh_token",
  });
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params,
  });
  const tok = await res.json();
  if (!res.ok) {
    // invalid_grant = refresh_token revogado/expirado. Limpa a conexão para que a UI
    // volte a mostrar "conectar" em vez de ficar travada como "conectado mas quebrado".
    if (tok?.error === "invalid_grant") {
      await admin.from("google_calendar_tokens").delete().eq("user_id", userId);
      throw new Error("Conexão com o Google Calendar expirou ou foi revogada. Reconecte em Integrações → Google Calendar.");
    }
    throw new Error("Refresh falhou: " + JSON.stringify(tok));
  }

  const expiresAt = new Date(Date.now() + (tok.expires_in - 60) * 1000).toISOString();
  await admin.from("google_calendar_tokens").update({
    access_token: tok.access_token,
    expires_at: expiresAt,
  }).eq("user_id", userId);

  return { ...row, access_token: tok.access_token, expires_at: expiresAt };
}

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

    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const body = await req.json();
    const action = body.action as string;

    if (action === "status") {
      const { data: row } = await admin.from("google_calendar_tokens").select("email, calendar_id").eq("user_id", user.id).maybeSingle();
      return new Response(JSON.stringify({ connected: !!row, email: row?.email ?? null, calendar_id: row?.calendar_id ?? "primary" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "disconnect") {
      await admin.from("google_calendar_tokens").delete().eq("user_id", user.id);
      return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const tok = await getValidToken(admin, user.id);
    const calendarId = encodeURIComponent(tok.calendar_id || "primary");

    if (action === "events") {
      const { timeMin, timeMax } = body;
      const url = `https://www.googleapis.com/calendar/v3/calendars/${calendarId}/events?timeMin=${encodeURIComponent(timeMin)}&timeMax=${encodeURIComponent(timeMax)}&singleEvents=true&orderBy=startTime&maxResults=250`;
      const res = await fetch(url, { headers: { Authorization: `Bearer ${tok.access_token}` } });
      const data = await res.json();
      if (!res.ok) throw new Error(JSON.stringify(data));
      const items = (data.items || []).map((e: any) => ({
        id: e.id,
        summary: e.summary || "(sem título)",
        start: e.start?.dateTime || e.start?.date,
        end: e.end?.dateTime || e.end?.date,
        meet: e.hangoutLink || null,
        status: e.status,
      }));
      return new Response(JSON.stringify({ events: items }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (action === "freebusy") {
      const { timeMin, timeMax } = body;
      const res = await fetch(`https://www.googleapis.com/calendar/v3/freeBusy`, {
        method: "POST",
        headers: { Authorization: `Bearer ${tok.access_token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ timeMin, timeMax, items: [{ id: tok.calendar_id || "primary" }] }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(JSON.stringify(data));
      return new Response(JSON.stringify({ busy: data.calendars?.[tok.calendar_id || "primary"]?.busy ?? [] }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "create_event") {
      const { title, description, startISO, endISO, attendeeEmail, withMeet = true, timeZone = "America/Sao_Paulo" } = body;
      const event: any = {
        summary: title,
        description: description || "",
        start: { dateTime: startISO, timeZone },
        end: { dateTime: endISO, timeZone },
      };
      if (attendeeEmail) event.attendees = [{ email: attendeeEmail }];
      if (withMeet) {
        event.conferenceData = {
          createRequest: { requestId: crypto.randomUUID(), conferenceSolutionKey: { type: "hangoutsMeet" } },
        };
      }
      const res = await fetch(
        `https://www.googleapis.com/calendar/v3/calendars/${calendarId}/events?conferenceDataVersion=1&sendUpdates=all`,
        { method: "POST", headers: { Authorization: `Bearer ${tok.access_token}`, "Content-Type": "application/json" }, body: JSON.stringify(event) }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(JSON.stringify(data));
      return new Response(JSON.stringify({
        id: data.id,
        meet: data.hangoutLink || data.conferenceData?.entryPoints?.find((p: any) => p.entryPointType === "video")?.uri || null,
        htmlLink: data.htmlLink,
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (action === "delete_event") {
      const { eventId } = body;
      const res = await fetch(
        `https://www.googleapis.com/calendar/v3/calendars/${calendarId}/events/${eventId}?sendUpdates=all`,
        { method: "DELETE", headers: { Authorization: `Bearer ${tok.access_token}` } }
      );
      if (!res.ok && res.status !== 410 && res.status !== 404) {
        const t = await res.text();
        throw new Error(t);
      }
      return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    return new Response(JSON.stringify({ error: "ação inválida" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});