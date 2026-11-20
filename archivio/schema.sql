-- Archivio unico dei telefoni. Incollalo nell'SQL editor di Supabase, una volta.
-- Poi: Authentication → Users → Add user, con la mail del locale.
-- In Authentication → Providers → Email, disattiva le iscrizioni pubbliche.
-- La chiave service_role non va nel telefono e non va su GitHub.
-- Qui entra solo la chiave anon, insieme all'indirizzo del progetto.

create table if not exists public.righe (
  user_id uuid not null references auth.users (id) on delete cascade,
  collezione text not null,
  id text not null,
  corpo jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, collezione, id)
);

create index if not exists righe_utente on public.righe (user_id, collezione);

alter table public.righe enable row level security;

drop policy if exists righe_proprie on public.righe;
create policy righe_proprie on public.righe
  for all
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

grant usage on schema public to authenticated;
grant select, insert, update, delete on table public.righe to authenticated;
