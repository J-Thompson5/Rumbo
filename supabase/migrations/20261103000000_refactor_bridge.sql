-- ============================================================================
-- Fractal · Puente entre el refactor y la base de datos existente
-- ============================================================================
-- El refactor trabaja con un modelo simple:
--   * objetivo: título, descripción y fecha meta
--   * hito: período semanal/mensual, fecha límite y completado
--
-- La base de datos actual ya tiene ese mismo contenido con otros nombres:
--   * goals.deadline         -> fecha meta del objetivo
--   * milestones.type        -> monthly / weekly
--   * milestones.period_end  -> fecha límite del hito
--   * milestones.closed_at   -> hito completado
--
-- Esta migración es NO destructiva e idempotente. No crea tablas paralelas ni
-- borra datos: agrega las columnas de compatibilidad que el refactor usa y
-- rellena el estado de los hitos que ya estaban completados.
-- ============================================================================

-- Columnas base que el refactor necesita leer/escribir.
alter table public.goals
  add column if not exists deadline date;

alter table public.milestones
  add column if not exists type text,
  add column if not exists period_start date,
  add column if not exists period_end date,
  add column if not exists closed_at timestamptz;

-- El refactor usa `completed` como marca editable desde la interfaz.
-- Se mantiene `closed_at` sincronizado para no romper el código anterior.
alter table public.milestones
  add column if not exists completed boolean not null default false,
  add column if not exists completed_at timestamptz;

-- Los hitos que ya estaban completados (por cierre explícito, tareas o aportes)
-- arrancan marcados para que el refactor conserve el progreso existente.
update public.milestones m
set completed = true,
    completed_at = coalesce(m.completed_at, m.closed_at, now())
where m.completed = false
  and (
    m.closed_at is not null
    or exists (
      select 1
      from public.tasks t
      where t.milestone_id = m.id
      group by t.milestone_id
      having count(*) > 0
         and count(*) filter (where t.is_completed) = count(*)
    )
    or (
      m.target_value is not null
      and m.target_value > 0
      and coalesce(
        (
          select sum(pe.amount)
          from public.progress_entries pe
          where pe.goal_id = m.goal_id
            and pe.entry_date between coalesce(m.period_start, m.start_date::date)
                                  and coalesce(m.period_end, m.end_date::date)
        ),
        0
      ) >= m.target_value
    )
  );

-- Vista con los nombres que consume el refactor. Las escrituras siguen
-- haciéndose sobre goals/milestones para no duplicar datos.
create or replace view public.milestone_cards as
select
  m.id,
  m.goal_id,
  g.user_id,
  m.title,
  case
    when lower(coalesce(m.type, '')) in ('weekly', 'semanal', 'week') then 'semanal'
    else 'mensual'
  end as period,
  coalesce(m.period_end, m.end_date::date) as due_date,
  m.completed,
  m.completed_at,
  m.created_at
from public.milestones m
join public.goals g on g.id = m.goal_id;

do $$
begin
  if current_setting('server_version_num')::int >= 150000 then
    execute 'alter view public.milestone_cards set (security_invoker = true)';
  end if;
end
$$;

grant select on public.milestone_cards to authenticated;

-- Índices para las pantallas nuevas: listado por usuario y detalle por objetivo.
create index if not exists goals_user_created_at_idx
  on public.goals (user_id, created_at desc);

create index if not exists milestones_goal_period_end_idx
  on public.milestones (goal_id, period_end);

create index if not exists milestones_goal_completed_idx
  on public.milestones (goal_id, completed);

-- Documentación del mapeo para quien revise el esquema desde Supabase.
comment on column public.goals.deadline is
  'Fecha meta del objetivo. El refactor la muestra como target_date.';

comment on column public.milestones.type is
  'Periodicidad del hito: monthly o weekly. El refactor la muestra como mensual o semanal.';

comment on column public.milestones.period_end is
  'Fecha límite del hito. El refactor la muestra como due_date.';

comment on column public.milestones.completed is
  'Hito completado. Se mantiene sincronizado con closed_at.';

comment on column public.milestones.closed_at is
  'Cierre del hito. Se mantiene sincronizado con completed/completed_at.';

-- Refresca el esquema expuesto por PostgREST.
notify pgrst, 'reload schema';
