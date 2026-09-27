-- Leaderboard for Z'imtZ'imt Jump: one row per player (case-insensitive name) holding their best score.
-- Run in Supabase: Dashboard > SQL Editor > New query > paste > Run. Safe to run again.

create table if not exists public.scores (
  id bigint generated always as identity primary key,
  name text not null check (char_length(btrim(name)) between 1 and 16),
  score integer not null check (score between 0 and 1000000),
  altitude integer not null default 0 check (altitude between 0 and 1000000),
  created_at timestamptz not null default now()
);

-- Merge duplicates left by earlier versions: keep each player's best (then oldest) score.
delete from public.scores duplicate
using public.scores kept
where lower(duplicate.name) = lower(kept.name)
  and (duplicate.score < kept.score or (duplicate.score = kept.score and duplicate.id > kept.id));

create unique index if not exists scores_player_key on public.scores (lower(name));
create index if not exists scores_score_idx on public.scores (score desc, created_at asc);

-- Only way to write: keeps the higher of the stored and submitted score, returns the player's best.
create or replace function public.submit_score(p_name text, p_score integer, p_altitude integer)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  clean_name text := btrim(regexp_replace(p_name, '\s+', ' ', 'g'));
  best integer;
begin
  insert into public.scores as existing (name, score, altitude)
  values (clean_name, p_score, p_altitude)
  on conflict ((lower(name))) do update
    set name = excluded.name, score = excluded.score, altitude = excluded.altitude, created_at = now()
    where excluded.score > existing.score
  returning score into best;

  if best is null then
    select score into best from public.scores where lower(name) = lower(clean_name);
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
revoke execute on function public.submit_score(text, integer, integer) from public;
grant execute on function public.submit_score(text, integer, integer) to anon;
