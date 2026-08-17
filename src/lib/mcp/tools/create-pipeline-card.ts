import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser, notAuthed } from "../supabase";

export default defineTool({
  name: "create_pipeline_card",
  title: "Create pipeline CRM card",
  description:
    "Create a new CRM pipeline card for the signed-in user. Use this to move a lead into the sales pipeline.",
  inputSchema: {
    nome_empresa: z.string().min(1).describe("Company name."),
    contato: z.string().optional().describe("Contact person name."),
    telefone: z.string().optional().describe("Phone/WhatsApp."),
    email: z.string().optional().describe("Contact email."),
    estagio: z.string().optional().describe("Pipeline stage (default: first stage of the board)."),
    origem: z.string().optional().describe("Where the lead came from (e.g. 'maps', 'linkedin', 'instagram')."),
    valor_estimado: z.number().optional().describe("Estimated deal value."),
    observacoes: z.string().optional().describe("Internal notes."),
  },
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  handler: async (input, ctx) => {
    if (!ctx.isAuthenticated()) return notAuthed();
    const sb = supabaseForUser(ctx);
    const { data, error } = await sb
      .from("pipeline_cards")
      .insert({ ...input, user_id: ctx.getUserId() })
      .select()
      .single();
    if (error)
      return { content: [{ type: "text", text: error.message }], isError: true };
    return {
      content: [{ type: "text", text: `Created card ${data.id} for ${data.nome_empresa}` }],
      structuredContent: { card: data },
    };
  },
});
