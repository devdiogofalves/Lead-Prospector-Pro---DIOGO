# LeadsBooster — Prontidão para venda e produção

Use este documento antes de vender para clientes reais ou liberar um novo ambiente.

## Status recomendado antes de vender

- **Piloto acompanhado:** permitido quando build/typecheck passam e todos os smoke tests críticos passam em staging.
- **Self-service em escala:** só liberar quando webhooks estão protegidos, integrações externas testadas com secrets reais, documentação de deploy está atualizada e a dívida de lint está formalmente aceita ou reduzida.

## Secrets obrigatórios em produção

Configure no Supabase Dashboard → Edge Functions → Secrets.

### Supabase base

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`

### IA e e-mail

- `LOVABLE_API_KEY`
- `RESEND_API_KEY` se o fluxo de e-mail transacional via Resend estiver ativo.
- `LOVABLE_SEND_URL` apenas se for necessário sobrescrever o endpoint padrão.

### Webhooks públicos

Estes endpoints ficam com `verify_jwt = false` porque são chamados por sistemas externos, então precisam de validação própria.

- `KIWIFY_WEBHOOK_TOKEN` — obrigatório para `/kiwify-webhook`.
- `UNIPILE_WEBHOOK_SECRET` — obrigatório para callbacks Unipile.

> Para desenvolvimento/local existe o escape hatch `ALLOW_INSECURE_WEBHOOKS=true`. Não configure isso em produção.

### WhatsApp / Mandrack

- `MANDRACK_API_KEY`
- `MANDRACK_URL`, normalmente `https://api.mandrackstudio.ia.br`.

### Google Calendar

- `GOOGLE_OAUTH_CLIENT_ID`
- `GOOGLE_OAUTH_CLIENT_SECRET`

### Kiwify

- `KIWIFY_WEBHOOK_TOKEN`

No painel Kiwify, configure o webhook com:

```text
https://<project-ref>.supabase.co/functions/v1/kiwify-webhook?token=<KIWIFY_WEBHOOK_TOKEN>
```

### Unipile

- Cada cliente configura API Key/DSN via painel.
- O servidor precisa de `UNIPILE_WEBHOOK_SECRET` para proteger callbacks.
- O `unipile-connect-link` injeta esse token automaticamente no `notify_url` do Hosted Auth.
- Para webhooks cadastrados manualmente no dashboard Unipile, use também `?token=<UNIPILE_WEBHOOK_SECRET>`.

## Fluxos que precisam passar em staging

1. Cadastro/login com e-mail e Google OAuth.
2. Compra aprovada Kiwify → usuário criado/reativado → e-mail/WhatsApp de boas-vindas.
3. Branding do cliente salvo e refletido na UI.
4. Cadastro de APIs do cliente: Gemini/OpenAI, Apify, Google Places, Unipile, Dados4U, ElevenLabs quando aplicável.
5. Conexão WhatsApp Mandrack por QR/pairing.
6. Busca de leads Google Maps e extensão Chrome com licença.
7. Busca Instagram via Apify.
8. Busca LinkedIn e Hosted Auth Unipile.
9. Enfileiramento e envio de Disparo Humanizado.
10. Webhook de resposta WhatsApp → qualificação → pipeline/handoff.
11. LinkedIn DM/cadência e pausa automática quando lead responde.
12. Disparo por e-mail e unsubscribe/suppression.
13. Google Calendar OAuth e criação de reunião.
14. Admin cria/pausa/reativa cliente e altera plano.
15. Reseller cria cliente e lista subcontas.
16. Painel Saúde mostra filas e workers sem pendências antigas.

## Critérios de go/no-go

### Go para piloto

- `npm run build` passa.
- `npx tsc --noEmit` passa.
- Checklist de smoke test crítico passa em staging.
- Secrets obrigatórios configurados.
- Um operador acompanha os primeiros clientes.

### No-go para venda em escala

- Webhook de pagamento sem secret.
- Webhook Unipile sem secret.
- WhatsApp não conecta em staging.
- Disparo/qualificação não conseguem enviar/responder.
- Admin não consegue criar/pausar cliente.
- Extensão não valida licença ou não sincroniza leads.

## Dívida conhecida aceita temporariamente

- `npm run lint` ainda falha por dívida herdada de `any` e poucos problemas de estilo.
- O build e o typecheck passam, mas lint não deve ser usado como gate até a dívida ser reduzida ou a regra `no-explicit-any` ser formalmente relaxada para módulos legados.
