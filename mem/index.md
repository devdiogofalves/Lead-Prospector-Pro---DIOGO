# Memory: index.md
Updated: now

# Project Memory

## Core
- **WHITE-LABEL PURO**: produto é genérico. NÃO existe marca/agente/nicho fixo. Cada cliente preenche briefing, empresa, produto, ICP, SPIN e nome da agente.
- Multi-tenant: Fase 1a feita (profiles + user_roles + auth + RLS em todas as tabelas de dados com `auth.uid() = user_id`).
- Tech: Supabase (DB/Edge Functions Deno), Mandrack (WhatsApp), Unipile (LinkedIn DM), Apify, Dados4U, Lovable AI Gateway (Gemini).
- Auth: email/senha + Google OAuth. Auto-confirm ON.
- UI: Dark theme Matrix neon (verde HSL 142 100% 50%), MatrixRain no Auth, #lovable-badge oculto.
- Constraints: Maps leads MUST ser celular BR válido (55+DDD+9+8 dígitos).
- Mandrack: admin token global (env `MANDRACK_API_KEY`/`MANDRACK_URL`) + token por instância em `user_integrations`. Evolution API foi removida — NUNCA voltar.
- Agente IA usa metodologia SPIN: 1 pergunta por mensagem, sem pitch nas fases S/P/I, só apresenta a empresa na fase N.

## Memories
- [SPIN+Rapport template](mem://features/spin-rapport-template) — Template default em src/lib/, botão Restaurar em /assistente, seedado no signup
- [White-label branding](mem://features/white-label-branding) — company_branding table + useBranding hook
- [Multi-tenant auth foundation](mem://features/multitenant-auth-foundation) — Profiles, user_roles, ProtectedRoute, Auth pages
- [Multi-tenant data isolation](mem://features/multitenant-data-isolation) — user_id em todas as tabelas + RLS
- [Apify configuration](mem://integrations/apify-api-configuration)
- [Google Maps webhook export](mem://integrations/google-maps-custom-webhook-export)
- [Google Maps webhook payload](mem://integrations/google-maps-webhook-payload)
- [Job board scraping](mem://integrations/job-board-scraping-strategy)
- [n8n test payload](mem://integrations/n8n-webhook-test-payload-handling)
- [Instagram Sheets sync](mem://integrations/instagram-n8n-sheets-sync)
- [Instagram extension webhook](mem://integrations/instagram-extension-webhook)
- [CNPJ search by name](mem://integrations/cnpj-lookup-by-name)
- [Sheets sync logic](mem://architecture/n8n-dashboard-google-sheets-sync)
- [CNPJ batch enrichment](mem://architecture/cnpj-batch-enrichment-logic)
- [Supreme search orchestration](mem://architecture/supreme-search-orchestration)
- [UI consistency](mem://style/ui-consistency-patterns)
- [Dashboard layout](mem://style/dashboard-layout-hierarchy)
- [Dashboard sidebar architecture](mem://style/dashboard-sidebar-architecture)
- [Database constraints](mem://database/unique-constraints)
- [Leads enrichment fields](mem://database/leads-table-enrichment-fields)
- [Instagram requirements](mem://constraints/instagram-scraping-requirements)
- [Google Maps dashboard](mem://features/google-maps-search-dashboard)
- [WhatsApp validation](mem://features/whatsapp-validation-evolution)
- [Bulk deletion](mem://features/bulk-lead-deletion)
- [Excel export](mem://features/universal-excel-export)
- [LinkedIn search](mem://features/linkedin-profile-search)
- [LinkedIn contact enrichment](mem://integrations/linkedin-contact-enrichment)
- [Job listing enrichment](mem://features/job-listing-data-enrichment)
- [Instagram scraping](mem://features/instagram-scraping-logic)
- [Instagram partner search](mem://features/instagram-partner-search)
- [CNPJ data enrichment](mem://features/cnpj-data-enrichment-system)
- [Unified enriched companies](mem://features/unified-enriched-companies-table)
- [Supreme search pipeline](mem://features/supreme-lead-search-pipeline)
- [Consolidated dashboard](mem://features/consolidated-prospecting-dashboard)
- [Supreme partner constraint](mem://features/supreme-search-partner-constraint)
- [Supreme real-time sync](mem://features/supreme-search-real-time-sync)
- [Supreme results management](mem://features/supreme-results-management)
- [Job board models](mem://product/job-board-integrations)
- [User API keys](mem://features/user-api-keys-and-integrations)
- [Native dispatch queue](mem://features/native-dispatch-queue)
- [Native qualification](mem://features/native-qualification)
- [Humanized dispatch tab](mem://features/humanized-dispatch-tab)
- [Evolution global handoff](mem://features/evolution-global-handoff)
- [Dados4U API](mem://integrations/dados4u-api)
- [Cliente Lucas Costa](mem://clients/lucas-costa) — Conta lucas.costa697@gmail.com: 13 chips Mandrack, Unipile completo, plano free precisa upgrade
- [Auditoria 2026-07 fixes](mem://security/audit-2026-07-fixes) — Blocos 1+2 (segurança/isolamento) aplicados; pendências dos blocos 3-5 listadas
