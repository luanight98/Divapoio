-- Rode no Supabase SQL Editor (depois do schema.sql). Pode rodar mais de uma vez.

-- 1) Saldo e saques
alter table public.profiles add column if not exists saldo_centavos bigint not null default 0;

create table if not exists public.saques (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  valor_centavos bigint not null check (valor_centavos > 0),
  chave_pix text not null,
  status text not null default 'pendente',
  created_at timestamptz not null default now()
);
alter table public.saques enable row level security;
drop policy if exists "ler os próprios saques" on public.saques;
create policy "ler os próprios saques" on public.saques for select to authenticated using (auth.uid() = user_id);

create or replace function public.solicitar_saque(p_valor bigint, p_chave text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or p_valor <= 0 or length(trim(coalesce(p_chave,''))) < 5 then raise exception 'Dados inválidos'; end if;
  update public.profiles set saldo_centavos = saldo_centavos - p_valor
   where id = auth.uid() and saldo_centavos >= p_valor;
  if not found then raise exception 'Saldo insuficiente'; end if;
  insert into public.saques (user_id, valor_centavos, chave_pix) values (auth.uid(), p_valor, trim(p_chave));
end $$;
revoke execute on function public.solicitar_saque(bigint, text) from public, anon;
grant execute on function public.solicitar_saque(bigint, text) to authenticated;

-- Para creditar a recompensa de alguém (só você, no SQL Editor):
-- update public.profiles set saldo_centavos = saldo_centavos + 100000 where id = 'UUID-DO-USUARIO';  -- R$ 1.000,00

-- 2) Estatísticas públicas: pessoas, total e visualizações de cada um (nomes abreviados)
create or replace function public.estatisticas_publicas() returns json
language sql security definer stable set search_path = public as $$
  select json_build_object(
    'pessoas',     (select count(*) from public.profiles where views > 0),
    'cadastrados', (select count(*) from public.profiles),
    'total_views', (select coalesce(sum(views), 0) from public.profiles),
    'usuarios',    (select coalesce(json_agg(u), '[]'::json) from (
        select concat_ws(' ', coalesce(nullif(split_part(nome, ' ', 1), ''), 'Usuário'),
                              nullif(left(split_part(nome, ' ', 2), 1), '') || '.') as nome, views
          from public.profiles where views > 0 order by views desc limit 50) u)
  );
$$;
grant execute on function public.estatisticas_publicas() to anon, authenticated;

-- 3) Leads: visitantes só podem INSERIR (com consentimento). Não leem nem apagam.
create table if not exists public.leads (
  id uuid primary key default gen_random_uuid(),
  email text not null check (email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  consentimento boolean not null default false,
  created_at timestamptz not null default now()
);
create unique index if not exists leads_email_unico on public.leads (lower(email));
alter table public.leads enable row level security;
drop policy if exists "visitantes podem se cadastrar" on public.leads;
create policy "visitantes podem se cadastrar" on public.leads
  for insert to anon, authenticated with check (consentimento = true);
revoke all on public.leads from anon, authenticated;
grant insert on public.leads to anon, authenticated;
