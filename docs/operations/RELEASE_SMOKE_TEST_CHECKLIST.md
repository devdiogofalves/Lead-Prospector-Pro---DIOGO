# Checklist de smoke test por release

Preencha uma cópia deste checklist a cada deploy de staging/produção.

| Área | Teste | Evidência | Status |
|---|---|---|---|
| Build | `npx tsc --noEmit` passa | log do CI/local | ☐ |
| Build | `npm run build` passa | log do CI/local | ☐ |
| Auth | login e logout funcionam | usuário de teste | ☐ |
| Auth | reset de senha funciona | e-mail recebido | ☐ |
| Kiwify | compra aprovada cria/reativa cliente | user_id + plan | ☐ |
| Kiwify | cancelamento pausa cliente | status paused | ☐ |
| Branding | nome, agente, logo e cor aparecem no painel | screenshot | ☐ |
| APIs | salvar/remover chave por provider | provider salvo | ☐ |
| WhatsApp | criar/conectar chip Mandrack | instância online | ☐ |
| WhatsApp | enviar mensagem manual/teste | mensagem recebida | ☐ |
| Google Maps | buscar leads pelo painel | leads salvos | ☐ |
| Extensão | validar licença | licença ativa | ☐ |
| Extensão | sincronizar leads Maps | leads salvos | ☐ |
| Instagram | busca via Apify | contatos salvos | ☐ |
| CNPJ | consulta individual | lead enriquecido | ☐ |
| Dados4U | consulta/enriquecimento | campos preenchidos | ☐ |
| LinkedIn | Hosted Auth Unipile conecta | account_id salvo | ☐ |
| LinkedIn | busca manual salva contato | contato salvo | ☐ |
| LinkedIn DM | envio/cadência avança | status atualizado | ☐ |
| E-mail | gerar/enviar campanha | log sent | ☐ |
| E-mail | unsubscribe funciona | suppressed_emails | ☐ |
| Disparo | enfileirar campanha WhatsApp | dispatch_queue pending | ☐ |
| Worker | dispatch-worker envia e marca sent | status sent | ☐ |
| Qualificação | webhook recebe resposta | qualification_messages | ☐ |
| Qualificação | worker responde e qualifica | conversation qualified | ☐ |
| Pipeline | card criado/movido | pipeline_cards/history | ☐ |
| Calendar | OAuth conecta | token salvo | ☐ |
| Calendar | reunião com Meet é criada | scheduled_meetings | ☐ |
| Admin | criar cliente | cliente criado | ☐ |
| Admin | mudar plano/pausar | client_subscriptions | ☐ |
| Reseller | criar subconta | cliente listado | ☐ |
| Saúde | métricas sem stuck/overdue crítico | tela /saude | ☐ |

## Resultado

- Ambiente:
- Data:
- Responsável:
- Versão/commit:
- Aprovado para produção? `sim / não`
- Observações:
