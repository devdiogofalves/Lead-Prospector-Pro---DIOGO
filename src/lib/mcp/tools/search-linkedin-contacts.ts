import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser, notAuthed } from "../supabase";

export default defineTool({
  name: "search_linkedin_contacts",
  title: "Search LinkedIn contacts",
  description:
    "Search LinkedIn contacts prospected by the signed-in user. Optional filter matches name, position or company.",
  inputSchema: {
    query: z.string().optional().describe("Text to match against name/cargo/empresa."),
    limit: z.number().int().min(1).max(100).optional().describe("Max rows (default 25)."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ query, limit }, ctx) => {
    if (!ctx.isAuthenticated()) return notAuthed();
    const sb = supabaseForUser(ctx);
    let q = sb
      .from("linkedin_contacts")
      .select("id, nome, cargo, empresa, localizacao, linkedin_url, email, telefone, cadencia_status, etapa_atual")
      .eq("user_id", ctx.getUserId())
      .order("created_at", { ascending: false })
      .limit(limit ?? 25);
    if (query && query.trim()) {
      const like = `%${query.trim()}%`;
      q = q.or(`nome.ilike.${like},cargo.ilike.${like},empresa.ilike.${like}`);
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
