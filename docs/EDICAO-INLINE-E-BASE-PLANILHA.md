# Edição inline de leads + Base estilo planilha

> Documento de referência para implementação futura. Não implementar agora.
> Última atualização: 2026-05-23

## Contexto

Hoje o operador consegue **ver, disparar e excluir** leads, mas **não consegue editar** nenhum campo (nome do contato, telefone, email, cargo, observações). Quando a IA captura um dado errado (telefone com DDD inválido, nome truncado, cargo desatualizado), o operador precisa apagar o lead e refazer a busca — perde tempo e perde o histórico.

Além disso, não existe uma "base mãe" no estilo planilha (Airtable/Google Sheets) onde o time consiga olhar tudo de uma vez, ordenar, filtrar por múltiplas colunas e editar célula a célula como num CRM tabular.

## Objetivo

1. Permitir **edição inline** de qualquer campo de lead direto na UI, com persistência imediata no Supabase.
2. Transformar as 6 páginas `/bases/*` (Maps, LinkedIn, Instagram, Empresas, JobCompanies, Vagas) em **planilhas vivas** com filtros, ordenação, busca global e edição célula a célula.
3. Adicionar **timeline de notas** (`notas_lead`) cruzando todas as fontes, para registrar cada interação sem sobrescrever dados.

## Estado atual (mapeado)

| Camada | Local | Estado |
|---|---|---|
| Visão consolidada | `/meus-leads` (`src/pages/MeusLeads.tsx`) | Unifica Maps + LinkedIn + IG + Empresas. Read-only + delete + dispatch. |
| Bases por fonte | `src/pages/bases/{Maps,LinkedIn,Instagram,Empresas,JobCompanies,Vagas}Base.tsx` | "Burras" — só reusam os componentes `*Table.tsx`. Read-only. |
| CRM Kanban | `/pipeline` (`pipeline_cards`) | ✅ Tem update + drag-drop. Único lugar com edição hoje. |
| Enriquecidos | `/enriquecidos` | Read-only cross-view. |
| Excel export | `useUniversalExcelExport` | ✅ Funciona em todas as tabelas. |
| Edição inline | — | ❌ Não existe. |
| Timeline/notas | — | ❌ Tabela `notas_lead` não existe. |

## Plano de implementação

### Fase 1 — Modal editável em `/meus-leads` (≈30 min)

**Impacto imediato.** O operador clica no lead → modal abre com todos os campos como `<Input>` editáveis + botão "Salvar". Persiste na tabela de origem (`source_table`).

**Arquivos:**
- `src/components/EditableLeadDialog.tsx` (novo) — dialog com form controlado.
- `src/pages/MeusLeads.tsx` — trocar modal read-only atual por `EditableLeadDialog`.
- `src/hooks/useLeadMutation.ts` (novo) — hook genérico: `supabase.from(source_table).update(patch).eq('id', id)`.

**Campos editáveis por source:**
- `leads` (Maps): nome_empresa, telefone, endereco, site, especialidades
- `linkedin_contacts`: nome, cargo, empresa, telefone, email, linkedin_url
- `instagram_contacts`: nome, username, whatsapp, email, bio
- `empresas_enriquecidas`: nome_empresa, telefone, email, site, socios

### Fase 2 — Bases viram planilha completa (≈1h30)

Cada página `/bases/*` ganha um `EditableLeadsTable` baseado em `@tanstack/react-table` com:

- **Edição inline** célula a célula (double-click → input → blur salva, debounce 500ms)
- **Filtros multi-coluna** (chips no topo de cada coluna)
- **Busca global** (input único filtra todas as colunas)
- **Sort multi-coluna** (shift+click)
- **Bulk select + bulk delete/dispatch**
- **Paginação server-side** (50/100/200 por página)
- **Export Excel** preservando filtros aplicados
- **Column visibility toggle**
- **Sticky header + sticky primeira coluna** (UX planilha real)

**Novos:**
- `src/components/EditableLeadsTable.tsx` — genérico, recebe `columns`, `source_table`, `data`, `onCellSave`.
- `src/hooks/useEditableLeads.ts` — wrap dos hooks existentes adicionando `updateField(id, field, value)` com optimistic update.

### Fase 3 — Timeline de notas (≈45 min)

**Migration:**
```sql
CREATE TABLE public.notas_lead (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL DEFAULT auth.uid(),
  lead_id UUID NOT NULL,
  source_table TEXT NOT NULL,
  texto TEXT NOT NULL,
  autor TEXT,
  tipo TEXT DEFAULT 'nota',  -- 'nota' | 'ligacao' | 'reuniao' | 'edicao'
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.notas_lead ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_notas_lead_lookup ON public.notas_lead(source_table, lead_id, created_at DESC);
-- policies padrão: user_id = auth.uid() OR has_role(admin)
```

**UI:**
- Painel lateral no `EditableLeadDialog` mostrando timeline cronológica reversa.
- Input "Adicionar nota" fixo no rodapé.
- Trigger opcional: toda edição inline gera nota automática `tipo='edicao'` ("Telefone alterado de X para Y por @autor").

## Ordem recomendada

1. **Fase 1** — entrega valor imediato em 30 min, sem tocar em schema.
2. **Fase 3** — migration simples, destrava histórico.
3. **Fase 2** — maior esforço, faz por último.

## O que NÃO mexer

- Schema das tabelas de leads (já tem `user_id`, RLS, triggers de deleção).
- `dispatch_queue`, `qualification_messages`, cadência LinkedIn.
- `useUniversalExcelExport` — já funciona, só estender colunas.
- `/pipeline` — já tem edição própria, não duplicar.

## Decisões em aberto

- Edição inline com **debounce + auto-save** (Airtable) ou **modo edição explícito** (Notion)? → Recomendação: auto-save com toast discreto.
- Notas automáticas em **toda** edição ou só em campos "críticos" (telefone, email)? → Recomendação: só críticos.
- Permitir **edição em bulk** (selecionar 10 linhas → mudar status)? → Sim, mas só na Fase 2.

## Estimativa total

~3h de trabalho focado, dividido em 3 PRs independentes.
