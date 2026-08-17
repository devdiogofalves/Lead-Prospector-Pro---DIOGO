import { auth, defineMcp } from "@lovable.dev/mcp-js";
import searchLeads from "./tools/search-leads";
import searchLinkedinContacts from "./tools/search-linkedin-contacts";
import searchInstagramContacts from "./tools/search-instagram-contacts";
import listPipelineCards from "./tools/list-pipeline-cards";
import createPipelineCard from "./tools/create-pipeline-card";

// Build the OAuth issuer from the Vite-inlined project ref so it stays
// import-safe (no runtime env reads at module top-level).
const projectRef =
  import.meta.env.VITE_SUPABASE_PROJECT_ID ?? "project-ref-unset";

export default defineMcp({
  name: "leadsbooster-mcp",
  title: "LeadsBooster",
  version: "0.1.0",
  instructions:
    "Access LeadsBooster prospecting data for the signed-in user. Use search_leads (Google Maps), search_linkedin_contacts and search_instagram_contacts to find prospects, list_pipeline_cards to inspect the sales CRM, and create_pipeline_card to promote a lead into the pipeline. All tools are scoped to the authenticated user's data.",
  auth: auth.oauth.issuer({
    issuer: `https://${projectRef}.supabase.co/auth/v1`,
    acceptedAudiences: "authenticated",
  }),
  tools: [
    searchLeads,
    searchLinkedinContacts,
    searchInstagramContacts,
    listPipelineCards,
    createPipelineCard,
  ],
});
