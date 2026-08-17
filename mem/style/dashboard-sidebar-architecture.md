---
name: dashboard-sidebar-architecture
description: Sidebar navigation structure with route-based pages instead of single-page scrolling
type: design
---
Dashboard usa sidebar lateral colapsável (`collapsible="icon"`) com `AppLayout` em `src/components/AppLayout.tsx` envolvendo `<Outlet/>`.

Grupos do menu (`src/components/AppSidebar.tsx`):
- Pipeline → `/` (Busca Suprema = home)
- Buscas Individuais → `/buscas/{maps,cnpj,linkedin,instagram,jobs,vagas,dados4u}`
- Inteligência → `/enriquecidos` (Visão 360°)
- Bases de Dados → `/bases/{empresas,maps,linkedin,instagram,job-companies,vagas}`
- Sistema → `/configuracoes`

Cada página vive em `src/pages/{Suprema,Enriquecidos,buscas/*,bases/*,configuracoes/*}.tsx` e consome só os hooks que precisa. Header simplificado (só botão Disparar) fica ao lado do `SidebarTrigger` no shell.
