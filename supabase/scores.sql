-- Leaderboard for Z'imtZ'imt Jump: one row per player (case-insensitive name) and device ('pc' or 'mobile')
-- holding their best score, so PC and mobile have separate leaderboards.
-- Run in Supabase: Dashboard > SQL Editor > New query > paste > Run. Safe to run again.

create table if not exists public.scores (
  id bigint generated always as identity primary key,
  name text not null check (char_length(btrim(name)) between 1 and 16),
  score integer not null check (score between 0 and 1000000),
  altitude integer not null default 0 check (altitude between 0 and 1000000),
  device text not null default 'pc',
  created_at timestamptz not null default now()
);

-- Tables created before the device column existed.
alter table public.scores add column if not exists device text not null default 'pc';
alter table public.scores drop constraint if exists scores_device_check;
alter table public.scores add constraint scores_device_check check (device in ('pc', 'mobile'));

-- Merge duplicates left by earlier versions: keep each player's best (then oldest) score per device.
delete from public.scores duplicate
using public.scores kept
where lower(duplicate.name) = lower(kept.name) and duplicate.device = kept.device
  and (duplicate.score < kept.score or (duplicate.score = kept.score and duplicate.id > kept.id));

-- One row per player and device: PC and mobile have separate leaderboards.
drop index if exists public.scores_player_key;
create unique index if not exists scores_player_device_key on public.scores (lower(name), device);
create index if not exists scores_score_idx on public.scores (score desc, created_at asc);

-- Only way to write: keeps the higher of the stored and submitted score, returns the player's best.
drop function if exists public.submit_score(text, integer, integer);
create or replace function public.submit_score(p_name text, p_score integer, p_altitude integer, p_device text default 'pc')
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  clean_name text := btrim(regexp_replace(p_name, '\s+', ' ', 'g'));
  best integer;
begin
  insert into public.scores as existing (name, score, altitude, device)
  values (clean_name, p_score, p_altitude, p_device)
  on conflict ((lower(name)), device) do update
    set name = excluded.name, score = excluded.score, altitude = excluded.altitude, device = excluded.device, created_at = now()
    where excluded.score > existing.score
  returning score into best;

  if best is null then
    select score into best from public.scores where lower(name) = lower(clean_name) and device = p_device;
  end if;
  return best;
end;
$$;

-- Public key: read the leaderboard and call submit_score, nothing else.
alter table public.scores enable row level security;

drop policy if exists "Public read" on public.scores;
create policy "Public read" on public.scores for select to anon using (true);
drop policy if exists "Public insert" on public.scores;

revoke insert, update, delete on public.scores from anon, authenticated;
grant select on public.scores to anon;
revoke execute on function public.submit_score(text, integer, integer, text) from public;
grant execute on function public.submit_score(text, integer, integer, text) to anon;
