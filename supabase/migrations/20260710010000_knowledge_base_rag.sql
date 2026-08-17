-- Base de conhecimento (RAG) para a IA de qualificação/disparo.
-- Aplicada ao vivo em 2026-07-10; este arquivo registra a mudança no histórico.

create extension if not exists vector;

create table if not exists public.knowledge_documents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  source_type text not null default 'upload',
  storage_path text,
  status text not null default 'pending',
  char_count int default 0,
  chunk_count int default 0,
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.knowledge_chunks (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.knowledge_documents(id) on delete cascade,
  user_id uuid not null,
  chunk_index int not null,
  content text not null,
  embedding vector(768),
  created_at timestamptz not null default now()
);

create index if not exists knowledge_chunks_doc_idx on public.knowledge_chunks(document_id);
create index if not exists knowledge_chunks_user_idx on public.knowledge_chunks(user_id);
create index if not exists knowledge_chunks_embedding_idx on public.knowledge_chunks using hnsw (embedding vector_cosine_ops);

alter table public.knowledge_documents enable row level security;
alter table public.knowledge_chunks enable row level security;

drop policy if exists "kd_own" on public.knowledge_documents;
create policy "kd_own" on public.knowledge_documents for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "kc_own" on public.knowledge_chunks;
create policy "kc_own" on public.knowledge_chunks for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create or replace function public.match_knowledge_chunks(_user_id uuid, _query vector(768), _match_count int default 5)
returns table(content text, similarity float)
language sql stable security definer set search_path to 'public' as $$
  select c.content, 1 - (c.embedding <=> _query) as similarity
  from public.knowledge_chunks c
  where c.user_id = _user_id and c.embedding is not null
  order by c.embedding <=> _query
  limit _match_count;
$$;
revoke execute on function public.match_knowledge_chunks(uuid, vector, int) from public;
revoke execute on function public.match_knowledge_chunks(uuid, vector, int) from anon;
revoke execute on function public.match_knowledge_chunks(uuid, vector, int) from authenticated;
grant execute on function public.match_knowledge_chunks(uuid, vector, int) to service_role;

insert into storage.buckets (id, name, public) values ('knowledge-docs','knowledge-docs', false)
on conflict (id) do nothing;

drop policy if exists "kdocs_insert_own" on storage.objects;
create policy "kdocs_insert_own" on storage.objects for insert to authenticated
  with check (bucket_id='knowledge-docs' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "kdocs_select_own" on storage.objects;
create policy "kdocs_select_own" on storage.objects for select to authenticated
  using (bucket_id='knowledge-docs' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "kdocs_delete_own" on storage.objects;
create policy "kdocs_delete_own" on storage.objects for delete to authenticated
  using (bucket_id='knowledge-docs' and (storage.foldername(name))[1] = auth.uid()::text);
