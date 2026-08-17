# Handoff — LeadsBooster: Publicação Instagram + Auditoria Multi-tenant

> Documento de continuidade para o Cowork. Reúne diagnóstico, correções feitas, estado atual e o que falta. Data: 2026-07-14.

---

## 0. TL;DR (resumo executivo)

- **Sintoma:** Instagram parou de publicar ("Edge Function returned a non-2xx status code").
- **Causa raiz atual:** a conexão do Instagram via **Unipile** é por cookie e **cai a cada 1-2 dias** (`Unipile 401 disconnected_account`).
- **Solução construída:** publicar via **API oficial da Meta** (token long-lived estável), com Unipile só como fallback. Mais 7 correções de auditoria multi-tenant.
- **Tudo commitado e no `main`** (branch `claude/leadsbooster-audit-10-agents-kojqsk`, último commit `01bcbf1`).
- **BLOQUEIO ATUAL:** o **deploy das edge functions não aconteceu**. Push externo pro GitHub atualiza o código no Lovable, mas **não dispara o deploy das edge functions no Supabase** — isso precisa partir de dentro do Lovable.
- **Última evidência (banco):** nenhum post novo foi criado/atualizado em 2026-07-14; a última tentativa é de 13/07 22:26 com o erro **antigo** do Unipile → o clique de publicar de hoje **nem chega no `social-publish`**, falha antes (provável geração de conteúdo/imagem ou função não deployada).

---

## 1. Contexto do projeto

- **LeadsBooster** — SaaS B2B white-label multi-tenant (React/Vite + Supabase Edge Functions em Deno).
- **Repo GitHub:** `nucleodameta-lab/leadsboostercleo` (branch default `main`).
- **Projeto Lovable:** `bb845b67-c9ad-4e58-882f-cdf4ec916b12` (app `leadsboostercleo.lovable.app`).
- **Supabase:** `owxcdevylkljaiilevav`.
- **Base atual:** 7 usuários. 1 com Instagram Meta conectado (admin), 3 com Instagram via Unipile, 4 com Apify próprio, 1 com Apify admin-compartilhado.

---

## 2. Diagnóstico da falha de publicação

1. **Erro observado:** `instagram: Edge Function returned a non-2xx status code`.
2. **Erro real no banco (`social_posts.last_error`):**
   ```
   Unipile /posts 401: {"status":401,"type":"errors/disconnected_account",
   "title":"Disconnected account",
   "detail":"The account appears to be disconnected from the provider service."}
   ```
3. **Conclusão:** a imagem gerava normal (`n_media: 1`); o que falhava era o **Unipile** — a sessão de cookie do Instagram tinha caído. Conta reconectava (dia 12) e caía de novo (dia 13). Ficar reconectando é enxugar gelo.
4. **Regressão anterior (já corrigida):** `kie-ai-generate` (PR do Codex #15) resolvia a chave Kie.ai só via RPC `get_ai_key_for_user`; se o RPC falhasse, retornava `needs_key:true` → frontend não setava `media_urls` → `social-publish` 400 (Instagram exige mídia). Corrigido com fallback direto + passar `apiKey` ao `generateOpenAIImages`.

---

## 3. Correções entregues (8 commits no `main`)

Branch: `claude/leadsbooster-audit-10-agents-kojqsk` → merjado no `main`.

| Commit | O que faz |
|---|---|
| `7e05375` | **kie-ai-generate**: fallback direto p/ chave Kie.ai + passa `apiKey` ao OpenAI. Restaura geração de imagem. |
| `0593b50` | **linkedin-dm**: guarda cross-panel na resolução de conta Unipile (não pega conta de outro painel em chave compartilhada). |
| `43c15f2` | **Apify**: `jobboard-scrape`/`joblisting-scrape` passam a resolver chave por painel via novo `_shared/apify-key.ts` (própria → toggle admin → admin → global). |
| `edff24d` | **DadosBooster**: `dados4u-query-v2` troca a API Dados4U (fora do ar) pelo DadosBooster (`dadosbooster.lovable.app`, keyless), mesmo contrato de saída. |
| `e322aa9` | **UI**: renomeia rótulos visíveis Dados4U → DadosBooster (mantém nomes técnicos). |
| `36192b1` | **Polish**: situação CNPJ legível (2→ATIVA...); remove card de API DadosBooster (keyless); health check DadosBooster sempre OK. |
| `4be7d84` | **social-publish**: publica Instagram via **API oficial da Meta** (feed/stories/reels/carrossel), Unipile só fallback. |
| `910762c` | **meta-instagram-oauth-start**: reativa scope `instagram_business_content_publish` (necessário p/ publicar). |
| `01bcbf1` | **CalendarioTab**: solta a trava que exigia conta Unipile p/ publicar Instagram (Meta resolve por usuário) + nota na UI. |

> Merge trouxe também 13 commits que já estavam no `main` (trabalho Meta auto-reply/OAuth do time). Um deles tinha **removido** o scope `content_publish` — por isso o commit `910762c` reativa.

### Detalhe técnico — publicação via Meta (`social-publish/index.ts`)
- Função `publishInstagramViaMeta(admin, userId, post, mediaUrls, caption)`.
- Lê `meta_instagram_accounts` por `user_id` (token long-lived). Se não houver conta Meta → retorna `null` → cai no Unipile.
- Fluxo oficial (validado na doc Meta): `POST graph.instagram.com/v21.0/{ig_user_id}/media` → polling `GET ?fields=status_code` até `FINISHED` → `POST /{ig_user_id}/media_publish`.
- Tipos: feed (imagem única), `media_type=STORIES`, `media_type=REELS` (video_url + cover_url), `media_type=CAROUSEL` (children com `is_carousel_item=true`).
- Em sucesso grava `status=published`, `post_url` (permalink) e `unipile_post_id`=media_id.

---

## 4. Estado da base (multi-tenant) — impacto das mudanças

| Recurso | Situação | Impacto |
|---|---|---|
| Meta Instagram conectado | 1 (admin) | Só ele pega Meta agora; os 6 caem no Unipile (= comportamento atual, sem regressão). |
| Instagram via Unipile | 3 | Continuam via Unipile; ganham Meta ao conectar. |
| Apify próprio | 4 | Inalterado (chave própria vence). |
| Apify admin-compartilhado | 1 | Agora **realmente** usa a credencial do admin (antes ignorava). |
| DadosBooster | todos (keyless) | Todos passam a enriquecer, sem precisar de chave. |

**Garantia:** tudo filtrado por `user_id` (`meta_instagram_accounts`, `user_api_keys`, `social_posts`, `dados4u_consultas`). Nenhum dado/token cruza entre clientes. App Meta é único (rate-limit/review no nível do app), mas cota de publicação é por conta IG (100/24h).

---

## 5. App Review Meta

- Status: **Publicado**. Caso de uso publicado: **"Gerenciar mensagens e conteúdo no Instagram"** (inclui content publishing).
- Scopes no OAuth (`meta-instagram-oauth-start`): `instagram_business_basic`, `instagram_business_manage_messages`, `instagram_business_manage_comments`, `instagram_business_content_publish` (reativado).
- Redirect URI (precisa estar liberado no app Meta):
  `https://owxcdevylkljaiilevav.supabase.co/functions/v1/meta-instagram-oauth-callback`
- Fluxo Método B (Instagram Login, sem Página do Facebook): `instagram.com/oauth/authorize` → `api.instagram.com/oauth/access_token` → `graph.instagram.com` (`ig_exchange_token`, token 60 dias).
- Token do admin: `long_lived`, válido até **2026-09-12**, renovado 14/07 01:47.
- **Risco a monitorar:** se algum cliente receber `invalid_scope` ao reconectar → `content_publish` não está em Advanced Access; reverter o scope.

---

## 6. BLOQUEIO ATUAL — deploy não aconteceu

### O problema
- Lovable **já está sincronizado** com o último commit (`latest_commit_sha: 01bcbf1`, confirmado via API).
- Mas **push externo pro GitHub NÃO dispara o deploy das edge functions no Supabase** — o Lovable só roda o pipeline de deploy quando a ação parte de dentro dele. Por isso "não tem nada pra publicar" na UI, mas as functions ao vivo ainda são as antigas.

### Evidência (banco, 2026-07-14)
- Nenhum `social_posts` criado/atualizado hoje. Última atividade: 13/07 22:26 com erro **antigo** do Unipile.
- Logo, o clique de publicar de hoje **não chega no `social-publish`** → o "erro nas edge functions" está acontecendo **antes** (provável geração de conteúdo/imagem, ou função não deployada crashando no boot).

### Limitação da conexão MCP do Lovable nesta sessão
- Acesso é **nível projeto/viewer** (token com `"access_type":"viewer"`).
- ✅ Funciona: `get_project`, `query_database`, `read_file`, `deploy_project` (retornou "pending").
- ❌ Falha com `404 user_not_found`: `get_me`, `send_message`, `list_projects` — ações que precisam agir "em nome do usuário" (consomem créditos do workspace).
- **Consequência:** o assistente **não consegue** acionar o agente do Lovable nem garantir o deploy das edge functions. Isso precisa ser feito pelo dono na sessão dele do Lovable.

---

## 7. Próximos passos (para o Cowork executar)

### Passo 1 — Deploiar as edge functions (dentro do Lovable)
No editor do Lovable do LeadsBooster, no chat do agente, enviar:
> "Faça o deploy das edge functions atualizadas para o Supabase e publique o app. NÃO altere código — apenas sincronize e deploye o commit atual (01bcbf1). Confirme o status de: social-publish, meta-instagram-oauth-start, kie-ai-generate, dados4u-query-v2, jobboard-scrape, joblisting-scrape, linkedin-dm e _shared/apify-key.ts."

(Alternativa: fazer uma micro-edição dentro do Lovable p/ forçar o pipeline de deploy.)

### Passo 2 — Reconectar o Instagram (Meta)
Integrações → Meta → reconectar. Necessário para o token novo carregar o scope `content_publish`.

### Passo 3 — Publicar um post de teste e validar pelo banco
Query de verificação:
```sql
select status, provider, post_url, left(coalesce(last_error,''),400) as last_error,
       to_char(updated_at,'YYYY-MM-DD HH24:MI:SS') as updated_at
from social_posts
where channel='instagram'
order by updated_at desc limit 3;
```
Interpretação do `last_error`:
- `status=published` → publicou via Meta ✅
- `"Instagram via Meta falhou (...)"` → código novo no ar, mas falta reconectar/scope
- `"Unipile /posts 401 disconnected"` → **código velho ainda** → o deploy não rolou

### Passo 4 — Se persistir "erro nas edge functions"
Pegar o erro real: DevTools (F12) → Network → clicar publicar → achar a request **vermelha** → nome dela = função que quebra → aba Response = mensagem. Também dá pra ver em Supabase → Edge Functions → Logs.

---

## 8. Pendências/dívidas conhecidas (não bloqueiam)

- Endpoint `email` do DadosBooster (busca reversa por e-mail) trava no upstream `revalida.online` — verificar lá. Os outros 4 tipos (cpf, cnpj, nome, celular) OK.
- Reautorizar o conector Lovable na sessão claude.ai (para `get_me`/`send_message` funcionarem e permitir deploy assistido).
- `secret KIWIFY_WEBHOOK_TOKEN` e produto Kiwify (SaaS) — pendências antigas do CLAUDE.md.
- Migrar consumidores Meta restantes (`meta-instagram-webhook`, `insights`, `resolve-media`, `metrics-sync`) de `graph.facebook.com` → `graph.instagram.com` (plano em `docs`/plan file).

---

## 9. Referências rápidas

- Branch de trabalho: `claude/leadsbooster-audit-10-agents-kojqsk` (== `main` no commit `01bcbf1`).
- Edge functions-chave: `social-publish`, `meta-instagram-oauth-start`, `kie-ai-generate`, `dados4u-query-v2`, `_shared/apify-key.ts`.
- Frontend-chave: `src/components/conteudo/CalendarioTab.tsx` (publish gate), `src/pages/Conteudo.tsx` (auto-post), `src/pages/configuracoes/CanaisTab.tsx`.
- Doc Meta content publishing: `developers.facebook.com/docs/instagram-platform/content-publishing`.
