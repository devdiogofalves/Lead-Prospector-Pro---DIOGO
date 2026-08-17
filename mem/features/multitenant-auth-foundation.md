---
name: multitenant-auth-foundation
description: Authentication foundation for white-label resale (profiles, roles, protected routes)
type: feature
---
Painel está virando multi-tenant pra revenda white-label. Cada cliente que comprar loga e vê só os próprios dados.

**Schema (Fase 1a — implementada):**
- `profiles` (user_id FK auth.users, display_name, avatar_url, bio) — RLS: usuário só vê o próprio
- `user_roles` (user_id, role enum app_role: admin|user) — separada do profiles pra evitar privilege escalation
- Função `has_role(user_id, role)` security definer (evita recursão em RLS)
- Trigger `on_auth_user_created` cria profile + role 'user' automaticamente no signup

**Frontend:**
- `src/hooks/useAuth.tsx` — AuthProvider com onAuthStateChange ANTES de getSession (evita race)
- `src/components/ProtectedRoute.tsx` — bloqueia rotas não-públicas, redireciona pra /auth
- `src/pages/Auth.tsx` — Google OAuth (via `lovable.auth.signInWithOAuth`) + email/senha
- `src/pages/ForgotPassword.tsx` + `src/pages/ResetPassword.tsx` — fluxo de recuperação
- Header tem botão Sair + email do usuário

**Pendente (Fases 1b/1c):**
- Adicionar `user_id` nas 8 tabelas de dados (leads, empresas_enriquecidas, instagram_contacts, linkedin_contacts, job_board_companies, job_listings, dados4u_consultas, saved_webhooks)
- Reescrever as RLS policies dessas tabelas (atualmente todas `USING (true)` — público)
- Atualizar edge functions pra gravar com user_id do JWT
- Atribuir dados existentes ao primeiro admin via botão "Reivindicar dados"
