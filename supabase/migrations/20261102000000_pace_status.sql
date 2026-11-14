-- ============================================================================
-- Fractal · Estado de ritmo calculado (ahead / on_track / at_risk / completed)
-- ============================================================================
-- Cambios NO destructivos:
--   * Solo se agregan/reemplazan funciones y vistas (las vistas no guardan datos).
--   * No se tocan tablas base ni se pierden datos.
--   * Se eliminan primero las vistas dependientes para evitar el error 42P16
--     de PostgreSQL al modificar o reordenar columnas de una vista existente.
-- ============================================================================

-- ============================================================================
-- 1. Fracción de tiempo transcurrida de un período
-- ============================================================================
create or replace function public.period_elapsed_fraction(
  p_start date,
  p_end date,
  p_as_of date default current_date
)
returns numeric
language sql
stable
set search_path = public
as $$
  select case
    when p_start is null or p_end is null or p_end < p_start then 0::numeric
    else least(
      1::numeric,
      greatest(
        0::numeric,
        ((p_as_of - p_start + 1)::numeric / (p_end - p_start + 1)::numeric)
      )
    )
  end;
$$;

-- ============================================================================
-- 2. Función de clasificación del ritmo
-- ============================================================================
create or replace function public.pace_status(
  p_actual numeric,
  p_expected numeric,
  p_target numeric,
  p_deadline date
)
returns text
language plpgsql
stable
set search_path = public
as $$
declare
  c_ahead constant numeric := 1.10;
  c_on_track constant numeric := 0.90;
  v_ratio numeric;
begin
  -- 1. completed: el valor real alcanzó o superó el objetivo
  if p_target is not null and coalesce(p_actual, 0) >= p_target then
    return 'completed';
  end if;

  -- 2. on_track: período aún no empieza
  if coalesce(p_expected, 0) <= 0 then
    return 'on_track';
  end if;

  -- Fecha límite vencida sin completarse -> at_risk
  if p_deadline is not null and p_deadline < current_date then
    return 'at_risk';
  end if;

  v_ratio := coalesce(p_actual, 0) / p_expected;

  -- 3. ahead: ratio >= 1.10
  if v_ratio >= c_ahead then
    return 'ahead';
  end if;

  -- 4. on_track: 0.90 <= ratio < 1.10
  if v_ratio >= c_on_track then
    return 'on_track';
  end if;

  -- 5. at_risk: ratio < 0.90
  return 'at_risk';
end;
$$;

-- ============================================================================
-- 3. Limpieza de vistas previas (evita error 42P16 por cambio de columnas)
-- ============================================================================
drop view if exists public.goal_status cascade;
drop view if exists public.milestone_status cascade;
drop view if exists public.goals_overview cascade;
drop view if exists public.milestones_overview cascade;

-- ============================================================================
-- 4. Recreación de milestones_overview
-- ============================================================================
create view public.milestones_overview as
with task_stats as (
  select
    t.milestone_id,
    count(*)::int as total_tasks,
    (count(*) filter (where t.is_completed))::int as done_tasks
  from public.tasks t
  where t.milestone_id is not null
  group by t.milestone_id
),
entry_stats as (
  select
    m.id as milestone_id,
    coalesce(sum(pe.amount), 0)::numeric as total_contributed
  from public.milestones m
  left join public.progress_entries pe
    on pe.goal_id = m.goal_id
   and pe.entry_date between coalesce(m.period_start, m.start_date::date)
                         and coalesce(m.period_end, m.end_date::date)
  group by m.id
)
select
  m.id,
  m.goal_id,
  m.parent_id,
  m.title,
  m.type,
  m.start_date,
  m.end_date,
  m.created_at,
  m.period_start,
  m.period_end,
  m.target_value,
  m.is_necessary,
  m.closed_at,
  coalesce(ts.total_tasks, 0) as total_tasks,
  coalesce(ts.done_tasks, 0) as done_tasks,
  coalesce(es.total_contributed, 0) as total_contributed,
  case
    when m.target_value is not null and m.target_value > 0 then
      least(100, round(coalesce(es.total_contributed, 0) / m.target_value * 100, 2))
    when m.target_value = 0 then 100
    when coalesce(m.completed, m.closed_at is not null) then 100
    when m.target_value is null and coalesce(ts.total_tasks, 0) > 0 then
      round(coalesce(ts.done_tasks, 0)::numeric / ts.total_tasks * 100, 2)
    else 0
  end as progress_percentage,
  case
    when m.target_value is not null then
      greatest(m.target_value - coalesce(es.total_contributed, 0), 0)
    else null
  end as remaining_value,
  coalesce(m.completed, m.closed_at is not null) as completed,
  m.completed_at
from public.milestones m
join public.goals g on g.id = m.goal_id
left join task_stats ts on ts.milestone_id = m.id
left join entry_stats es on es.milestone_id = m.id
where g.user_id = auth.uid();

-- ============================================================================
-- 5. Recreación de milestone_status
-- ============================================================================
create view public.milestone_status as
with base as (
  select
    mo.*,
    public.period_elapsed_fraction(
      coalesce(mo.period_start, mo.start_date::date),
      coalesce(mo.period_end, mo.end_date::date),
      current_date
    ) as elapsed_fraction,
    case
      when mo.target_value is not null then mo.total_contributed
      when mo.completed then 1::numeric
      when coalesce(mo.total_tasks, 0) > 0
        then round(mo.done_tasks::numeric / mo.total_tasks, 4)
      else 0::numeric
    end as actual_value,
    case
      when mo.target_value is not null then mo.target_value
      when mo.completed or coalesce(mo.total_tasks, 0) > 0 then 1::numeric
      else null
    end as target_value_for_pace
  from public.milestones_overview mo
)
select
  b.id,
  b.goal_id,
  b.parent_id,
  b.title,
  b.type,
  b.start_date,
  b.end_date,
  b.created_at,
  b.period_start,
  b.period_end,
  b.target_value,
  b.is_necessary,
  b.closed_at,
  b.completed,
  b.completed_at,
  b.total_tasks,
  b.done_tasks,
  b.total_contributed,
  b.progress_percentage,
  b.remaining_value,
  coalesce(b.target_value_for_pace, 0) * b.elapsed_fraction as expected,
  b.actual_value as actual,
  case
    when coalesce(b.target_value_for_pace, 0) > 0
      and b.elapsed_fraction > 0
      then round(b.actual_value / (b.target_value_for_pace * b.elapsed_fraction), 4)
    else null
  end as ratio,
  public.pace_status(
    b.actual_value,
    coalesce(b.target_value_for_pace, 0) * b.elapsed_fraction,
    b.target_value_for_pace,
    coalesce(b.period_end, b.end_date::date)
  ) as status
from base b;

-- ============================================================================
-- 6. Recreación de goals_overview
-- ============================================================================
create view public.goals_overview as
with task_stats as (
  select
    m.goal_id,
    count(t.id)::int as total_tasks,
    (count(t.id) filter (where t.is_completed))::int as done_tasks
  from public.milestones m
  left join public.tasks t on t.milestone_id = m.id
  group by m.goal_id
),
milestone_summary as (
  select
    m.goal_id,
    count(m.id)::int as total_milestones,
    (count(m.id) filter (where coalesce(m.completed, m.closed_at is not null)))::int as done_milestones
  from public.milestones m
  group by m.goal_id
),
contribution_stats as (
  select
    pe.goal_id,
    coalesce(sum(pe.amount), 0)::numeric as total_contributed
  from public.progress_entries pe
  group by pe.goal_id
)
select
  g.id,
  g.user_id,
  g.title,
  g.description,
  g.deadline,
  g.created_at,
  g.target_value,
  g.unit,
  g.start_date,
  coalesce(ts.total_tasks, 0) as total_tasks,
  coalesce(ts.done_tasks, 0) as done_tasks,
  coalesce(ms.total_milestones, 0) as total_milestones,
  coalesce(ms.done_milestones, 0) as done_milestones,
  coalesce(cs.total_contributed, 0) as total_contributed,
  case
    when g.target_value is not null and g.target_value > 0 then
      least(100, round(coalesce(cs.total_contributed, 0) / g.target_value * 100, 2))
    when coalesce(ts.total_tasks, 0) > 0 then
      round(coalesce(ts.done_tasks, 0)::numeric / ts.total_tasks * 100, 2)
    when coalesce(ms.total_milestones, 0) > 0 then
      round(coalesce(ms.done_milestones, 0)::numeric / ms.total_milestones * 100, 2)
    else 0
  end as progress_percentage,
  case
    when g.target_value is not null then 'amount'
    else 'tasks'
  end as progress_mode,
  case
    when g.target_value is not null then
      greatest(g.target_value - coalesce(cs.total_contributed, 0), 0)
    else null
  end as remaining_value
from public.goals g
left join task_stats ts on ts.goal_id = g.id
left join milestone_summary ms on ms.goal_id = g.id
left join contribution_stats cs on cs.goal_id = g.id
where g.user_id = auth.uid();

-- ============================================================================
-- 7. Recreación de goal_status
-- ============================================================================
create view public.goal_status as
with milestone_totals as (
  select
    m.goal_id,
    sum(
      coalesce(m.target_value, 0) * public.period_elapsed_fraction(
        coalesce(m.period_start, m.start_date::date),
        coalesce(m.period_end, m.end_date::date),
        current_date
      )
    ) as expected_amount,
    count(*) filter (
      where m.is_necessary
        and m.closed_at is null
        and (m.completed is null or not m.completed)
        and coalesce(m.period_end, m.end_date::date) >= current_date
    )::int as periods_remaining
  from public.milestones_overview m
  group by m.goal_id
),
base as (
  select
    g.*,
    case
      when g.progress_mode = 'amount' then coalesce(mt.expected_amount, 0)
      else public.period_elapsed_fraction(
        coalesce(g.start_date, g.created_at::date),
        g.deadline::date,
        current_date
      )
    end as expected_value,
    case
      when g.progress_mode = 'amount' then g.total_contributed
      when coalesce(g.total_tasks, 0) > 0
        then round(g.done_tasks::numeric / g.total_tasks, 4)
      when coalesce(g.total_milestones, 0) > 0
        then round(g.done_milestones::numeric / g.total_milestones, 4)
      else 0::numeric
    end as actual_value,
    case
      when g.progress_mode = 'amount' then g.target_value
      when coalesce(g.total_tasks, 0) > 0 or coalesce(g.total_milestones, 0) > 0 then 1::numeric
      else null
    end as target_value_for_pace,
    coalesce(mt.periods_remaining, 0) as periods_remaining
  from public.goals_overview g
  left join milestone_totals mt on mt.goal_id = g.id
),
classified as (
  select
    b.*,
    public.pace_status(
      b.actual_value,
      b.expected_value,
      b.target_value_for_pace,
      b.deadline::date
    ) as status_value
  from base b
)
select
  c.id,
  c.user_id,
  c.title,
  c.description,
  c.deadline,
  c.created_at,
  c.target_value,
  c.unit,
  c.start_date,
  c.total_tasks,
  c.done_tasks,
  c.total_milestones,
  c.done_milestones,
  c.total_contributed,
  c.progress_percentage,
  c.progress_mode,
  c.remaining_value,
  c.expected_value as expected,
  c.actual_value as actual,
  case
    when c.expected_value > 0
      then round(c.actual_value / c.expected_value, 4)
    else null
  end as ratio,
  c.status_value as status,
  c.periods_remaining,
  case
    when c.progress_mode = 'amount'
      and c.target_value is not null
      and c.target_value > 0
      and c.periods_remaining > 0
      and c.status_value = 'at_risk'
      then round(greatest(c.target_value - c.actual_value, 0) / c.periods_remaining, 2)
    else null
  end as required_per_period
from classified c;

-- ============================================================================
-- 8. Seguridad: RLS con security_invoker
-- ============================================================================
do $$
begin
  if current_setting('server_version_num')::int >= 150000 then
    execute 'alter view public.milestones_overview set (security_invoker = true)';
    execute 'alter view public.milestone_status set (security_invoker = true)';
    execute 'alter view public.goals_overview set (security_invoker = true)';
    execute 'alter view public.goal_status set (security_invoker = true)';
  end if;
end
$$;

-- ============================================================================
-- 9. Permisos
-- ============================================================================
grant select on public.milestones_overview to authenticated;
grant select on public.milestone_status to authenticated;
grant select on public.goals_overview to authenticated;
grant select on public.goal_status to authenticated;

revoke all on function public.period_elapsed_fraction(date, date, date) from public;
revoke all on function public.period_elapsed_fraction(date, date, date) from anon;
grant execute on function public.period_elapsed_fraction(date, date, date) to authenticated;
grant execute on function public.period_elapsed_fraction(date, date, date) to service_role;

revoke all on function public.pace_status(numeric, numeric, numeric, date) from public;
revoke all on function public.pace_status(numeric, numeric, numeric, date) from anon;
grant execute on function public.pace_status(numeric, numeric, numeric, date) to authenticated;
grant execute on function public.pace_status(numeric, numeric, numeric, date) to service_role;

notify pgrst, 'reload schema';
