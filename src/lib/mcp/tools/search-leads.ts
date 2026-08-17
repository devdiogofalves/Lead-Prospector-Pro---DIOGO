import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser, notAuthed } from "../supabase";

export default defineTool({
  name: "search_leads",
  title: "Search Google Maps leads",
  description:
    "Search leads captured from Google Maps for the signed-in user. Optional text filter matches company name, address or specialties.",
  inputSchema: {
    query: z.string().optional().describe("Text to match against company name/address/specialties."),
    limit: z.number().int().min(1).max(100).optional().describe("Max rows (default 25)."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ query, limit }, ctx) => {
    if (!ctx.isAuthenticated()) return notAuthed();
    const sb = supabaseForUser(ctx);
    let q = sb
      .from("leads")
      .select("id, nome_empresa, telefone, endereco, site, rating, especialidades, cnpj, disparo")
      .eq("user_id", ctx.getUserId())
      .order("created_at", { ascending: false })
      .limit(limit ?? 25);
    if (query && query.trim()) {
      const like = `%${query.trim()}%`;
      q = q.or(
        `nome_empresa.ilike.${like},endereco.ilike.${like},especialidades.ilike.${like}`,
      );
    }
    const { data, error } = await q;
    if (error)
      return { content: [{ type: "text", text: error.message }], isError: true };
    return {
      content: [{ type: "text", text: JSON.stringify(data ?? []) }],
      structuredContent: { rows: data ?? [] },
    };
  },
});
