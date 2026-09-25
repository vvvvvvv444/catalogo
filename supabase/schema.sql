-- =====================================================================
--  VETRINA - struttura del database (versione 2: basta il link)
--  Supabase > SQL Editor > incolla tutto > Run.  Si puo' rilanciare.
--
--  Chi ha il link con il codice vede la vetrina (funzione vetrina()).
--  Solo gli amministratori (lei, piu' l'aiutante che scrive le descrizioni)
--  entrano con la password e modificano. Le registrazioni si chiudono da sole
--  dopo ogni nuovo amministratore: per aggiungerne uno va riaperta a mano.
-- =====================================================================

-- ---------- pulizia della versione 1 (clienti con approvazione) ----------
drop function if exists public.e_approvato() cascade;
drop table if exists public.clienti cascade;

-- ---------- tabelle ----------
create table if not exists public.impostazioni (
  id int primary key default 1 check (id = 1),
  nome_negozio text not null default 'La mia Vetrina',
  sottotitolo text not null default '',
  messaggio_benvenuto text not null default '',
  whatsapp text not null default '',
  aggiornato timestamptz not null default now()
);
alter table public.impostazioni add column if not exists codice_vetrina text not null default replace(gen_random_uuid()::text, '-', '');
alter table public.impostazioni add column if not exists registrazione_aperta boolean not null default true;
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
alter table public.prodotti add column if not exists da_descrivere boolean not null default false;
alter table public.prodotti add column if not exists visibile boolean not null default true;
create index if not exists prodotti_categoria on public.prodotti (categoria);
create index if not exists prodotti_marchio on public.prodotti (marchio_id);

create table if not exists public.amministratori (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text not null default '',
  nome text not null default '',
  creato timestamptz not null default now()
);
alter table public.amministratori add column if not exists email text not null default '';
alter table public.amministratori add column if not exists nome text not null default '';
alter table public.amministratori add column if not exists creato timestamptz not null default now();

-- ---------- chi e' chi ----------
create or replace function public.e_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.amministratori where user_id = auth.uid());
$$;

-- Ogni registrazione (quando e' aperta) crea un amministratore e richiude la porta.
create or replace function public.nuovo_utente() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if not coalesce((select registrazione_aperta from public.impostazioni where id = 1), false) then
    raise exception 'Registrazione chiusa';
  end if;
  insert into public.amministratori (user_id, email, nome)
  values (new.id, coalesce(new.email, ''), left(coalesce(new.raw_user_meta_data->>'nome', ''), 80))
  on conflict do nothing;
  update public.impostazioni set registrazione_aperta = false where id = 1;
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

-- ---------- funzioni pubbliche ----------
-- Nome del negozio per la pagina "vetrina privata" (senza codice).
create or replace function public.negozio() returns json
language sql stable security definer set search_path = public as $$
  select json_build_object('nome_negozio', nome_negozio, 'sottotitolo', sottotitolo,
                           'registrazione_aperta', registrazione_aperta)
  from public.impostazioni where id = 1;
$$;

-- Tutta la vetrina, solo con il codice giusto.
create or replace function public.vetrina(codice text) returns json
language plpgsql stable security definer set search_path = public as $$
declare i public.impostazioni;
begin
  select * into i from public.impostazioni where id = 1;
  if codice is null or length(codice) < 16 or codice <> i.codice_vetrina then
    return null;
  end if;
  return json_build_object(
    'impostazioni', json_build_object('nome_negozio', i.nome_negozio, 'sottotitolo', i.sottotitolo,
                                      'messaggio_benvenuto', i.messaggio_benvenuto, 'whatsapp', i.whatsapp),
    'marchi', coalesce((select json_agg(json_build_object('id', m.id, 'nome', m.nome) order by m.nome) from public.marchi m), '[]'::json),
    'prodotti', coalesce((select json_agg(json_build_object(
        'id', p.id, 'nome', p.nome, 'marchio_id', p.marchio_id, 'categoria', p.categoria, 'genere', p.genere,
        'prezzo', p.prezzo, 'prezzo_pieno', p.prezzo_pieno, 'descrizione', p.descrizione, 'dettagli', p.dettagli,
        'taglie', p.taglie, 'colori', p.colori, 'foto', p.foto, 'disponibile', p.disponibile,
        'in_evidenza', p.in_evidenza, 'codice', p.codice, 'ordine', p.ordine, 'creato', p.creato)
        order by p.ordine, p.creato desc)
      from public.prodotti p where p.visibile), '[]'::json)
  );
end $$;

-- Cambia il codice del link (il vecchio link smette di funzionare).
create or replace function public.nuovo_codice() returns text
language plpgsql security definer set search_path = public as $$
declare c text := replace(gen_random_uuid()::text, '-', '');
begin
  if not public.e_admin() then raise exception 'Permesso negato'; end if;
  update public.impostazioni set codice_vetrina = c where id = 1;
  return c;
end $$;

-- ---------- permessi (Row Level Security) ----------
alter table public.impostazioni   enable row level security;
alter table public.marchi         enable row level security;
alter table public.prodotti       enable row level security;
alter table public.amministratori enable row level security;

revoke all on public.impostazioni, public.marchi, public.prodotti, public.amministratori from anon;
grant usage on schema public to anon, authenticated;
grant select, update on public.impostazioni to authenticated;
grant select, insert, update, delete on public.marchi, public.prodotti to authenticated;
grant select on public.amministratori to authenticated;
revoke execute on function public.nuovo_codice() from public, anon;
grant execute on function public.e_admin(), public.negozio(), public.vetrina(text) to anon, authenticated;
grant execute on function public.nuovo_codice() to authenticated;

drop policy if exists "impostazioni: tutti leggono" on public.impostazioni;
drop policy if exists "impostazioni: admin legge" on public.impostazioni;
create policy "impostazioni: admin legge" on public.impostazioni for select to authenticated using (public.e_admin());
drop policy if exists "impostazioni: admin modifica" on public.impostazioni;
create policy "impostazioni: admin modifica" on public.impostazioni for update to authenticated
  using (public.e_admin()) with check (public.e_admin());

drop policy if exists "prodotti: approvati leggono" on public.prodotti;
drop policy if exists "prodotti: admin scrive" on public.prodotti;
create policy "prodotti: admin scrive" on public.prodotti for all to authenticated
  using (public.e_admin()) with check (public.e_admin());

drop policy if exists "marchi: approvati leggono" on public.marchi;
drop policy if exists "marchi: admin scrive" on public.marchi;
create policy "marchi: admin scrive" on public.marchi for all to authenticated
  using (public.e_admin()) with check (public.e_admin());

drop policy if exists "amministratori: se stesso" on public.amministratori;
drop policy if exists "amministratori: admin legge" on public.amministratori;
create policy "amministratori: admin legge" on public.amministratori for select to authenticated using (public.e_admin());

-- ---------- foto ----------
-- Cartella pubblica ma NON elencabile: ogni foto ha un nome casuale di 36 caratteri,
-- che si conosce solo dalla vetrina (cioe' avendo il link col codice).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('foto', 'foto', true, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set public = true;

drop policy if exists "foto: approvati vedono" on storage.objects;
drop policy if exists "foto: admin vede" on storage.objects;
create policy "foto: admin vede" on storage.objects for select to authenticated
  using (bucket_id = 'foto' and public.e_admin());
drop policy if exists "foto: admin carica" on storage.objects;
create policy "foto: admin carica" on storage.objects for insert to authenticated
  with check (bucket_id = 'foto' and public.e_admin());
drop policy if exists "foto: admin modifica" on storage.objects;
create policy "foto: admin modifica" on storage.objects for update to authenticated
  using (bucket_id = 'foto' and public.e_admin());
drop policy if exists "foto: admin cancella" on storage.objects;
create policy "foto: admin cancella" on storage.objects for delete to authenticated
  using (bucket_id = 'foto' and public.e_admin());

-- Fine: deve comparire "Success. No rows returned".

-- =====================================================================
--  VERSIONE 3: richieste dentro la vetrina (numero privato), aspetto e categorie modificabili
-- =====================================================================
alter table public.impostazioni add column if not exists aspetto jsonb not null default '{}'::jsonb;
alter table public.impostazioni add column if not exists categorie jsonb;
alter table public.impostazioni add column if not exists mostra_whatsapp boolean not null default false;

create table if not exists public.richieste (
  id uuid primary key default gen_random_uuid(),
  creato timestamptz not null default now(),
  nome text not null default '',
  contatto text not null default '',
  messaggio text not null default '',
  articoli jsonb not null default '[]'::jsonb,
  letta boolean not null default false
);
alter table public.richieste enable row level security;
revoke all on public.richieste from anon;
grant select, update, delete on public.richieste to authenticated;
drop policy if exists "richieste: admin" on public.richieste;
create policy "richieste: admin" on public.richieste for all to authenticated
  using (public.e_admin()) with check (public.e_admin());

-- Chi ha il link puo' mandare una richiesta (ma non leggerne nessuna).
create or replace function public.invia_richiesta(codice text, p_nome text, p_contatto text, p_messaggio text, p_articoli jsonb)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  if codice is null or codice <> (select codice_vetrina from public.impostazioni where id = 1) then
    raise exception 'Link non valido';
  end if;
  if length(trim(coalesce(p_nome, ''))) < 2 or length(trim(coalesce(p_contatto, ''))) < 3 then
    raise exception 'Mancano nome o contatto';
  end if;
  if (select count(*) from public.richieste where creato > now() - interval '10 minutes') >= 30 then
    raise exception 'Troppe richieste: riprova fra qualche minuto';
  end if;
  if jsonb_typeof(p_articoli) is distinct from 'array' or jsonb_array_length(p_articoli) > 100 then
    p_articoli := '[]'::jsonb;
  end if;
  insert into public.richieste (nome, contatto, messaggio, articoli)
  values (left(trim(p_nome), 80), left(trim(p_contatto), 120), left(coalesce(p_messaggio, ''), 2000), p_articoli);
  return true;
end $$;
revoke execute on function public.invia_richiesta(text, text, text, text, jsonb) from public;
grant execute on function public.invia_richiesta(text, text, text, text, jsonb) to anon, authenticated;

create or replace function public.negozio() returns json
language sql stable security definer set search_path = public as $$
  select json_build_object('nome_negozio', nome_negozio, 'sottotitolo', sottotitolo,
                           'registrazione_aperta', registrazione_aperta, 'aspetto', aspetto)
  from public.impostazioni where id = 1;
$$;

create or replace function public.vetrina(codice text) returns json
language plpgsql stable security definer set search_path = public as $$
declare i public.impostazioni;
begin
  select * into i from public.impostazioni where id = 1;
  if codice is null or length(codice) < 16 or codice <> i.codice_vetrina then
    return null;
  end if;
  return json_build_object(
    'impostazioni', json_build_object('nome_negozio', i.nome_negozio, 'sottotitolo', i.sottotitolo,
        'messaggio_benvenuto', i.messaggio_benvenuto, 'aspetto', i.aspetto, 'categorie', i.categorie,
        'mostra_whatsapp', i.mostra_whatsapp,
        'whatsapp', case when i.mostra_whatsapp then i.whatsapp else '' end),
    'marchi', coalesce((select json_agg(json_build_object('id', m.id, 'nome', m.nome) order by m.nome) from public.marchi m), '[]'::json),
    'prodotti', coalesce((select json_agg(json_build_object(
        'id', p.id, 'nome', p.nome, 'marchio_id', p.marchio_id, 'categoria', p.categoria, 'genere', p.genere,
        'prezzo', p.prezzo, 'prezzo_pieno', p.prezzo_pieno, 'descrizione', p.descrizione, 'dettagli', p.dettagli,
        'taglie', p.taglie, 'colori', p.colori, 'foto', p.foto, 'disponibile', p.disponibile,
        'in_evidenza', p.in_evidenza, 'codice', p.codice, 'ordine', p.ordine, 'creato', p.creato)
        order by p.ordine, p.creato desc)
      from public.prodotti p where p.visibile), '[]'::json)
  );
end $$;

-- ---------- v3b: passaparola (richieste spente di partenza) e codice breve automatico ----------
alter table public.impostazioni add column if not exists richieste_attive boolean not null default false;

create sequence if not exists public.prodotti_numero;
create or replace function public.codice_prodotto() returns trigger
language plpgsql as $$
begin
  if coalesce(trim(new.codice), '') = '' then
    new.codice := upper(left(regexp_replace(new.categoria, '[^a-zA-Z]', '', 'g') || 'XX', 2)) || '-' || lpad(nextval('public.prodotti_numero')::text, 3, '0');
  end if;
  return new;
end $$;
drop trigger if exists prodotti_codice on public.prodotti;
create trigger prodotti_codice before insert on public.prodotti
  for each row execute function public.codice_prodotto();

create or replace function public.invia_richiesta(codice text, p_nome text, p_contatto text, p_messaggio text, p_articoli jsonb)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  if codice is null or codice <> (select codice_vetrina from public.impostazioni where id = 1) then
    raise exception 'Link non valido';
  end if;
  if not (select richieste_attive from public.impostazioni where id = 1) then
    raise exception 'Le richieste dalla vetrina sono spente';
  end if;
  if length(trim(coalesce(p_nome, ''))) < 2 then
    raise exception 'Manca il nome';
  end if;
  if (select count(*) from public.richieste where creato > now() - interval '10 minutes') >= 30 then
    raise exception 'Troppe richieste: riprova fra qualche minuto';
  end if;
  if jsonb_typeof(p_articoli) is distinct from 'array' or jsonb_array_length(p_articoli) > 100 then
    p_articoli := '[]'::jsonb;
  end if;
  insert into public.richieste (nome, contatto, messaggio, articoli)
  values (left(trim(p_nome), 80), left(trim(coalesce(p_contatto, '')), 120), left(coalesce(p_messaggio, ''), 2000), p_articoli);
  return true;
end $$;

create or replace function public.vetrina(codice text) returns json
language plpgsql stable security definer set search_path = public as $$
declare i public.impostazioni;
begin
  select * into i from public.impostazioni where id = 1;
  if codice is null or length(codice) < 16 or codice <> i.codice_vetrina then
    return null;
  end if;
  return json_build_object(
    'impostazioni', json_build_object('nome_negozio', i.nome_negozio, 'sottotitolo', i.sottotitolo,
        'messaggio_benvenuto', i.messaggio_benvenuto, 'aspetto', i.aspetto, 'categorie', i.categorie,
        'richieste_attive', i.richieste_attive, 'mostra_whatsapp', i.mostra_whatsapp,
        'whatsapp', case when i.mostra_whatsapp then i.whatsapp else '' end),
    'marchi', coalesce((select json_agg(json_build_object('id', m.id, 'nome', m.nome) order by m.nome) from public.marchi m), '[]'::json),
    'prodotti', coalesce((select json_agg(json_build_object(
        'id', p.id, 'nome', p.nome, 'marchio_id', p.marchio_id, 'categoria', p.categoria, 'genere', p.genere,
        'prezzo', p.prezzo, 'prezzo_pieno', p.prezzo_pieno, 'descrizione', p.descrizione, 'dettagli', p.dettagli,
        'taglie', p.taglie, 'colori', p.colori, 'foto', p.foto, 'disponibile', p.disponibile,
        'in_evidenza', p.in_evidenza, 'codice', p.codice, 'ordine', p.ordine, 'creato', p.creato)
        order by p.ordine, p.creato desc)
      from public.prodotti p where p.visibile), '[]'::json)
  );
end $$;
