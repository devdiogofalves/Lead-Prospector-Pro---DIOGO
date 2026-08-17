---
name: White-label branding & onboarding
description: company_branding table + useBranding hook + /configuracoes/branding tab + ComeceAqui passo 1 "Personalize identidade". Substitui marcas/agentes fixos por brand dinâmico.
type: feature
---
- Tabela `company_branding` (1:1 user, RLS owner): company_name, agent_name (default "IA assistente"), agent_tagline, logo_url, primary_color. Trigger `handle_new_user` cria default ao registrar.
- `profiles.onboarding_step` (int 0-6) rastreia progresso do Wizard.
- Hook `src/hooks/useBranding.ts` expõe `{ branding, save }` e injeta `--brand-primary` CSS var. Hook `useOnboardingStep`.
- AppSidebar lê branding: cabeçalho mostra `company_name` + "powered by {agent_name}", grupo "💬 IA — {agent_name}", rodapé personalizado.
- BrandingTab em `/configuracoes/branding` permite editar tudo.
- ComeceAqui adicionou step 1 "Personalize a identidade" antes de APIs.
- Marca global agora é **LeadsBooster** (index.html title/OG, página Auth, descrições). Qualquer nome de agente vem de `company_branding.agent_name` por usuário.
