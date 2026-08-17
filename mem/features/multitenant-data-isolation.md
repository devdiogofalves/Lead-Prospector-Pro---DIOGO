---
name: Multi-tenant data isolation
description: Fase 1b — user_id em todas tabelas de dados, RLS por dono, DEFAULT auth.uid(), edge functions usam JWT
type: feature
---
## Fase 1b concluída

**Tabelas com `user_id` NOT NULL DEFAULT auth.uid()**: leads, instagram_contacts, linkedin_contacts, empresas_enriquecidas, job_board_companies, job_listings, dados4u_consultas, disparos_humanizados, saved_webhooks.

**RLS**: cada tabela tem 4 policies (SELECT/INSERT/UPDATE/DELETE) baseadas em `auth.uid() = user_id OR has_role(auth.uid(),'admin')`.

**Constraints únicas compostas**: `(telefone, user_id)`, `(username, user_id)`, `(linkedin_url, user_id)`, `(cnpj, user_id)`.

**Backfill**: todos os dados existentes pertencem ao admin Alex Barros (`18913027-765c-41af-8962-113d96120fbf`).

**Edge functions multi-tenant** (validam JWT e injetam userId):
- google-places-search, apify-scrape, instagram-scrape, instagram-profile-search, linkedin-scrape, linkedin-contact-enrich, cnpj-lookup, cnpj-batch-lookup, cnpj-search-by-name, jobboard-scrape, joblisting-scrape, dados4u-query, n8n-record-disparo.

**Pendente (webhooks externos sem JWT)**: webhook-leads, webhook-instagram, n8n-fetch-leads — precisam de token público por usuário.

## UI multi-tenant
- `/meus-leads` (`MeusLeads.tsx`): página unificada com tabs Maps/Instagram/LinkedIn/Empresas, seleção em massa, disparo via webhook do user.
- `OnboardingWizard.tsx` em `AppLayout`: 3 passos (webhook n8n, API n8n opcional, instância Evolution) — abre auto se faltar config.
- Sidebar: "Meus Leads" no grupo Pipeline.
