import { createClient } from "@supabase/supabase-js";

// This file is bundled into a Deno edge function at build time; `process.env`
// is polyfilled by Deno at runtime. Declare it here to keep the Vite TS build happy.
declare const process: { env: Record<string, string | undefined> };
import type { ToolContext } from "@lovable.dev/mcp-js";

export function supabaseForUser(ctx: ToolContext) {
  return createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_PUBLISHABLE_KEY!,
    {
      global: { headers: { Authorization: `Bearer ${ctx.getToken()}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    },
  );
}

export function notAuthed() {
  return {
    content: [{ type: "text" as const, text: "Not authenticated" }],
    isError: true,
  };
}
