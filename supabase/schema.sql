-- =====================================================================
--  CATALOGO - struttura del database
--  Supabase > SQL Editor > New query > incolla tutto > Run
--  Si puo' rilanciare senza perdere dati.
-- =====================================================================

-- ---------- tabelle ----------
create table if not exists public.impostazioni (
  id int primary key default 1 check (id = 1),
  nome_negozio text not null default 'Il mio Catalogo',
  sottotitolo text not null default '',
  messaggio_benvenuto text not null default '',
  whatsapp text not null default '',
  aggiornato timestamptz not null default now()
);
insert into public.impostazioni (id) values (1) on conflict do nothing;

create table if not exists public.marchi (
  id uuid primary key default gen_random_uuid(),
  nome text not null unique,
  creato timestamptz not null default now()
);

create table if not exists public.prodotti (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  marchio_id uuid references public.marchi(id) on delete set null,
  categoria text not null,
  genere text not null default 'donna',
  prezzo numeric(10,2),
  prezzo_pieno numeric(10,2),
  descrizione text not null default '',
  dettagli text not null default '',
  taglie text not null default '',
  colori text not null default '',
  foto text[] not null default '{}',
  disponibile boolean not null default true,
  in_evidenza boolean not null default false,
  codice text not null default '',
  ordine int not null default 0,
  creato timestamptz not null default now(),
  aggiornato timestamptz not null default now()
);
create index if not exists prodotti_categoria on public.prodotti (categoria);
create index if not exists prodotti_marchio on public.prodotti (marchio_id);

create table if not exists public.clienti (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text not null default '',
  nome text not null default '',
  telefono text not null default '',
  stato text not null default 'in_attesa' check (stato in ('in_attesa', 'approvato', 'bloccato')),
  creato timestamptz not null default now()
);

create table if not exists public.amministratori (
  user_id uuid primary key references auth.users(id) on delete cascade
);

-- ---------- chi e' chi ----------
create or replace function public.e_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.amministratori where user_id = auth.uid());
$$;

create or replace function public.e_approvato() returns boolean
language sql stable security definer set search_path = public as $$
  select public.e_admin()
      or exists (select 1 from public.clienti where user_id = auth.uid() and stato = 'approvato');
$$;

-- Ogni nuova registrazione diventa un cliente "in attesa".
-- La PRIMA persona che si registra diventa l'amministratrice.
create or replace function public.nuovo_utente() returns trigger
language plpgsql security definer set search_path = public as $$
declare primo boolean;
begin
  select not exists (select 1 from public.amministratori) into primo;
  insert into public.clienti (user_id, email, nome, telefono, stato)
  values (new.id, coalesce(new.email, ''),
          left(coalesce(new.raw_user_meta_data->>'nome', ''), 80),
          left(coalesce(new.raw_user_meta_data->>'telefono', ''), 30),
          case when primo then 'approvato' else 'in_attesa' end)
  on conflict (user_id) do nothing;
  if primo then
    insert into public.amministratori (user_id) values (new.id) on conflict do nothing;
  end if;
  return new;
end $$;

drop trigger if exists al_nuovo_utente on auth.users;
create trigger al_nuovo_utente after insert on auth.users
  for each row execute function public.nuovo_utente();

create or replace function public.tocca_aggiornato() returns trigger
language plpgsql as $$ begin new.aggiornato = now(); return new; end $$;
drop trigger if exists prodotti_aggiornato on public.prodotti;
create trigger prodotti_aggiornato before update on public.prodotti
  for each row execute function public.tocca_aggiornato();

-- ---------- permessi (Row Level Security) ----------
alter table public.impostazioni   enable row level security;
alter table public.marchi         enable row level security;
alter table public.prodotti       enable row level security;
alter table public.clienti        enable row level security;
alter table public.amministratori enable row level security;

grant usage on schema public to anon, authenticated;
grant select on public.impostazioni to anon, authenticated;
grant update on public.impostazioni to authenticated;
grant select, insert, update, delete on public.marchi, public.prodotti to authenticated;
grant select, update, delete on public.clienti to authenticated;
grant select on public.amministratori to authenticated;
grant execute on function public.e_admin(), public.e_approvato() to anon, authenticated;

-- nome del negozio: lo vede anche chi non e' entrato (pagina di accesso)
drop policy if exists "impostazioni: tutti leggono" on public.impostazioni;
create policy "impostazioni: tutti leggono" on public.impostazioni for select using (true);
drop policy if exists "impostazioni: admin modifica" on public.impostazioni;
create policy "impostazioni: admin modifica" on public.impostazioni for update to authenticated
  using (public.e_admin()) with check (public.e_admin());

-- prodotti e marchi: li vede solo chi e' approvato, li cambia solo l'admin
drop policy if exists "prodotti: approvati leggono" on public.prodotti;
create policy "prodotti: approvati leggono" on public.prodotti for select to authenticated using (public.e_approvato());
drop policy if exists "prodotti: admin scrive" on public.prodotti;
create policy "prodotti: admin scrive" on public.prodotti for all to authenticated
  using (public.e_admin()) with check (public.e_admin());

drop policy if exists "marchi: approvati leggono" on public.marchi;
create policy "marchi: approvati leggono" on public.marchi for select to authenticated using (public.e_approvato());
drop policy if exists "marchi: admin scrive" on public.marchi;
create policy "marchi: admin scrive" on public.marchi for all to authenticated
  using (public.e_admin()) with check (public.e_admin());

-- clienti: ognuno vede se stesso, l'admin vede e decide per tutti
drop policy if exists "clienti: se stesso o admin" on public.clienti;
create policy "clienti: se stesso o admin" on public.clienti for select to authenticated
  using (user_id = auth.uid() or public.e_admin());
drop policy if exists "clienti: admin modifica" on public.clienti;
create policy "clienti: admin modifica" on public.clienti for update to authenticated
  using (public.e_admin()) with check (public.e_admin());
drop policy if exists "clienti: admin cancella" on public.clienti;
create policy "clienti: admin cancella" on public.clienti for delete to authenticated using (public.e_admin());

drop policy if exists "amministratori: se stesso" on public.amministratori;
create policy "amministratori: se stesso" on public.amministratori for select to authenticated
  using (user_id = auth.uid());

-- ---------- foto (cartella privata) ----------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('foto', 'foto', false, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set public = false;

drop policy if exists "foto: approvati vedono" on storage.objects;
create policy "foto: approvati vedono" on storage.objects for select to authenticated
  using (bucket_id = 'foto' and public.e_approvato());
drop policy if exists "foto: admin carica" on storage.objects;
create policy "foto: admin carica" on storage.objects for insert to authenticated
  with check (bucket_id = 'foto' and public.e_admin());
drop policy if exists "foto: admin modifica" on storage.objects;
create policy "foto: admin modifica" on storage.objects for update to authenticated
  using (bucket_id = 'foto' and public.e_admin());
drop policy if exists "foto: admin cancella" on storage.objects;
create policy "foto: admin cancella" on storage.objects for delete to authenticated
  using (bucket_id = 'foto' and public.e_admin());

-- Fine. Controllo: deve comparire "Success. No rows returned".
