---
name: SPIN+Rapport default template
description: Template canônico em src/lib/spinRapportTemplate.ts. Botão "Restaurar template" em /assistente. Migration seedou handle_new_user para criar prospecting_profiles com prompt default.
type: feature
---
- `src/lib/spinRapportTemplate.ts` — constante `SPIN_RAPPORT_TEMPLATE` com placeholders `[NOME DA EMPRESA]` e `[DESCREVA A SOLUÇÃO/PRODUTO]`.
- Botão "Restaurar template SPIN+Rapport" no card System Prompt em `/assistente` (Assistente.tsx ~linha 594). Preenche `[NOME DA EMPRESA]` com `branding.company_name` automaticamente.
- `handle_new_user()` agora insere em `prospecting_profiles` (agent_system_prompt + system_prompt) com versão compacta do template para novos signups.
- Workers (dispatch-worker, qualification-worker, dispatch-preview) já usam fallback dinâmico via branding quando system_prompt vazio.
