-- Rode no Supabase: SQL Editor > New query > Run

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  nome text, telefone text,
  plano text not null default 'Grátis',
  views int not null default 0,
  last_view_at timestamptz,
  queue_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

-- O usuário só LÊ o próprio perfil. Sem policy de insert/update/delete:
-- views, plano e fila só mudam pelo servidor (chave secreta).
create policy "ler o próprio perfil" on public.profiles
  for select to authenticated using (auth.uid() = id);

-- Cria o perfil automaticamente no cadastro
create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, nome, telefone)
  values (new.id, new.raw_user_meta_data->>'nome', new.raw_user_meta_data->>'telefone');
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- Conta 1 visualização (máx. 1 a cada 14 s) e entra na fila aos 1.000. Retorna null se for cedo demais.
create function public.registrar_view(uid uuid) returns int
language plpgsql security definer set search_path = public as $$
declare v int;
begin
  update public.profiles
     set views = views + 1,
         last_view_at = now(),
         queue_at = case when views + 1 >= 1000 and queue_at is null then now() else queue_at end
   where id = uid and (last_view_at is null or last_view_at < now() - interval '14 seconds')
  returning views into v;
  return v;
end $$;

revoke execute on function public.registrar_view(uuid) from public, anon, authenticated;
grant execute on function public.registrar_view(uuid) to service_role;

-- Posição do usuário logado na fila (ordem de chegada)
create function public.minha_posicao() returns int
language sql security definer stable set search_path = public as $$
  select case when me.queue_at is null then null
    else (select count(*)::int + 1 from public.profiles p where p.queue_at is not null and p.queue_at < me.queue_at) end
  from public.profiles me where me.id = auth.uid();
$$;
revoke execute on function public.minha_posicao() from public, anon;
grant execute on function public.minha_posicao() to authenticated;

-- Total de visualizações da plataforma (para o pote)
create function public.total_views() returns bigint
language sql security definer stable set search_path = public as $$
  select coalesce(sum(views), 0)::bigint from public.profiles;
$$;
grant execute on function public.total_views() to anon, authenticated;
