# LeadsBooster

LeadsBooster é um SaaS B2B white-label para prospecção, enriquecimento, automação de disparos, qualificação por IA e pipeline comercial.

## Stack

- Frontend: React, TypeScript, Vite, Tailwind, shadcn/Radix UI.
- Backend: Supabase Postgres, Auth, Edge Functions em Deno, pg_cron/pgmq.
- Integrações: Mandrack/WhatsApp, Unipile, Apify, Dados4U, Google Places, Google Calendar, Kiwify e e-mail transacional.
- Extensão: Chrome Manifest V3 para extração/sincronização de leads do Google Maps.

## Fluxos principais

- Onboarding white-label: identidade da empresa, agente IA, APIs e WhatsApp.
- Prospecção: Google Maps, Instagram, LinkedIn, CNPJ e Dados4U.
- Disparo: WhatsApp humanizado, campanhas, e-mail, Instagram DM, Telegram e LinkedIn DM.
- Qualificação: respostas recebidas por webhook, IA com SPIN Selling, pipeline e handoff.
- Admin/WhiteLabel: criação de clientes, planos, suporte, métricas e revenda.

## Desenvolvimento local

```sh
npm install
npm run dev
```

Checks recomendados:

```sh
npx tsc --noEmit
npm run build
npm run lint
```

> Observação: no estado atual, `npm run lint` ainda possui dívida herdada. Consulte `docs/operations/LINT_DEBT_PLAN.md`.

## Produção e venda

Antes de vender ou publicar uma release, consulte:

- `docs/operations/PRODUCTION_READINESS.md`
- `docs/operations/RELEASE_SMOKE_TEST_CHECKLIST.md`
- `docs/operations/LINT_DEBT_PLAN.md`
- `docs/archive/evolution-deprecation.md`

## Decisões importantes

- WhatsApp novo usa Mandrack. Evolution API é legado/arquivado.
- Webhooks públicos precisam de validação própria por secret ou licença.
- `ALLOW_INSECURE_WEBHOOKS=true` é permitido apenas para desenvolvimento/local.
- Para piloto acompanhado, build/typecheck e smoke tests críticos precisam passar.
- Para self-service em escala, todas as integrações devem estar validadas em staging com secrets reais.
