import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser, notAuthed } from "../supabase";

export default defineTool({
  name: "search_instagram_contacts",
  title: "Search Instagram contacts",
  description:
    "Search Instagram contacts prospected by the signed-in user. Optional filter matches @username, name or bio.",
  inputSchema: {
    query: z.string().optional().describe("Text to match against username/nome/bio."),
    limit: z.number().int().min(1).max(100).optional().describe("Max rows (default 25)."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ query, limit }, ctx) => {
    if (!ctx.isAuthenticated()) return notAuthed();
    const sb = supabaseForUser(ctx);
    let q = sb
      .from("instagram_contacts")
      .select("id, username, nome, bio, seguidores, whatsapp, email, site, profile_url, is_business")
      .eq("user_id", ctx.getUserId())
      .order("created_at", { ascending: false })
      .limit(limit ?? 25);
    if (query && query.trim()) {
      const like = `%${query.trim()}%`;
      q = q.or(`username.ilike.${like},nome.ilike.${like},bio.ilike.${like}`);
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
