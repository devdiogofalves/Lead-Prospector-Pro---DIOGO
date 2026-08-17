import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser, notAuthed } from "../supabase";

export default defineTool({
  name: "list_pipeline_cards",
  title: "List pipeline CRM cards",
  description:
    "List CRM pipeline cards for the signed-in user, optionally filtered by stage.",
  inputSchema: {
    estagio: z.string().optional().describe("Pipeline stage to filter by."),
    limit: z.number().int().min(1).max(200).optional().describe("Max rows (default 50)."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ estagio, limit }, ctx) => {
    if (!ctx.isAuthenticated()) return notAuthed();
    const sb = supabaseForUser(ctx);
    let q = sb
      .from("pipeline_cards")
      .select("id, nome_empresa, contato, telefone, email, estagio, origem, valor_estimado, observacoes, proximo_followup_at, position")
      .eq("user_id", ctx.getUserId())
      .order("position", { ascending: true })
      .limit(limit ?? 50);
    if (estagio) q = q.eq("estagio", estagio);
    const { data, error } = await q;
    if (error)
      return { content: [{ type: "text", text: error.message }], isError: true };
    return {
      content: [{ type: "text", text: JSON.stringify(data ?? []) }],
      structuredContent: { rows: data ?? [] },
    };
  },
});
