# Plano para dívida de lint

## Estado atual

O projeto compila e gera build, mas `npm run lint` ainda falha por dívida herdada, principalmente `@typescript-eslint/no-explicit-any` em componentes, páginas e Edge Functions antigas.

## Decisão recomendada

Para venda inicial, aceitar temporariamente a dívida com estes gates mínimos:

- `npx tsc --noEmit` deve passar.
- `npm run build` deve passar.
- Arquivos novos ou alterados devem passar lint direcionado quando viável.
- Bugs críticos devem ser cobertos por smoke test em staging.

## Plano incremental

1. Separar lint de frontend e Supabase Functions.
2. Corrigir primeiro arquivos de borda crítica: webhooks, workers, admin e billing.
3. Criar tipos para payloads externos: Kiwify, Unipile, Mandrack, Apify, Dados4U.
4. Substituir `any` por `unknown` + type guards/Zod nos pontos de entrada.
5. Depois de reduzir a dívida, reativar `npm run lint` como gate obrigatório de CI.

## Módulos prioritários

1. `supabase/functions/kiwify-webhook`
2. `supabase/functions/unipile-*`
3. `supabase/functions/dispatch-worker`
4. `supabase/functions/qualification-worker`
5. `src/pages/Admin.tsx`
6. `src/components/AddImportLeads.tsx`
