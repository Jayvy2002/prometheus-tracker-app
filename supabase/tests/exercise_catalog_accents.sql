-- Audit 2 : le catalogue affiche les noms français avec leurs accents, sans
-- perdre l'identité ni la recherche sans accents.
\set ON_ERROR_STOP on
begin;

do $$
declare
  v_bench uuid;
begin
  select id into v_bench from public.exercises where name = 'Bench Press';
  if (select name_fr from public.exercises where id = v_bench) <> 'Développé couché' then
    raise exception 'bench name_fr not accented: %', (select name_fr from public.exercises where id = v_bench);
  end if;
  if (select name_fr from public.exercises where name = 'Deadlift') <> 'Soulevé de terre' then
    raise exception 'deadlift name_fr not accented';
  end if;
  if (select name_fr from public.exercises where name = 'Shrug') <> 'Haussement d''épaules' then
    raise exception 'shrug name_fr not accented';
  end if;
  if (select instructions from public.exercises where name = 'Squat') not like '%trapèzes%jusqu''à%parallèles%' then
    raise exception 'squat instructions not accented';
  end if;
  if exists (
    select 1 from public.exercises
     where created_by is null
       and name_fr ~ '(Developpe|Souleve|Ecarte|Elevation|halteres|epaules)'
  ) then
    raise exception 'an unaccented seeded name remains';
  end if;

  -- Identity and search keys are unchanged: an unaccented or accented query finds the same row.
  if (select exercise_id from public.exercise_aliases where normalized = public.exercise_normalize_name('Developpe couche')) <> v_bench then
    raise exception 'unaccented search lost the bench';
  end if;
  if (select exercise_id from public.exercise_aliases where normalized = public.exercise_normalize_name('Développé couché')) <> v_bench then
    raise exception 'accented search lost the bench';
  end if;
  if (select alias from public.exercise_aliases where exercise_id = v_bench and locale = 'fr' and source = 'canonical') <> 'Développé couché' then
    raise exception 'canonical fr alias not accented';
  end if;
end $$;

rollback;
\echo 'exercise catalog accents: French names accented, identity and unaccented search kept'
