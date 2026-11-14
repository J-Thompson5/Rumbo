-- ============================================================================
-- Fractal · Corrección de cálculo de progreso, cuotas de riesgo y períodos
-- ============================================================================
-- Cambios NO destructivos:
--   * Actualiza las vistas milestones_overview, milestone_status, goals_overview
--     y goal_status para que:
--     1. Los aportes asociados a un hito (pe.milestone_id = m.id) se reconozcan
--        directamente sin importar la fecha de inserción.
--     2. Al marcar un hito como completado, su monto (target_value) se refleje
--        en el aporte acumulado de la meta.
--     3. El estado de ritmo y la cuota 'Para volver al plan' se recalculen
--        restando las cuotas completadas.
-- ============================================================================

drop view if exists public.goal_status cascade;
drop view if exists public.milestone_status cascade;
drop view if exists public.goals_overview cascade;
drop view if exists public.milestones_overview cascade;

-- 1. Vista milestones_overview
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
    coalesce(sum(pe.amount), 0)::numeric as entries_sum
  from public.milestones m
  left join public.progress_entries pe
    on pe.goal_id = m.goal_id
   and (
     pe.milestone_id = m.id
     or (pe.milestone_id is null and pe.entry_date between coalesce(m.period_start, m.start_date::date)
                                                       and coalesce(m.period_end, m.end_date::date))
   )
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
  case
    when coalesce(m.completed, m.closed_at is not null) and m.target_value is not null
      then greatest(m.target_value, coalesce(es.entries_sum, 0))
    else coalesce(es.entries_sum, 0)
  end as total_contributed,
  case
    when m.target_value is not null and m.target_value > 0 then
      least(100, round(
        (case
          when coalesce(m.completed, m.closed_at is not null)
            then greatest(m.target_value, coalesce(es.entries_sum, 0))
          else coalesce(es.entries_sum, 0)
        end) / m.target_value * 100, 2))
    when m.target_value = 0 then 100
    when coalesce(m.completed, m.closed_at is not null) then 100
    when m.target_value is null and coalesce(ts.total_tasks, 0) > 0 then
      round(coalesce(ts.done_tasks, 0)::numeric / ts.total_tasks * 100, 2)
    else 0
  end as progress_percentage,
  case
    when m.target_value is not null then
      greatest(
        m.target_value - (case
          when coalesce(m.completed, m.closed_at is not null)
            then greatest(m.target_value, coalesce(es.entries_sum, 0))
          else coalesce(es.entries_sum, 0)
        end),
        0
      )
    else null
  end as remaining_value,
  coalesce(m.completed, m.closed_at is not null) as completed,
  m.completed_at
from public.milestones m
join public.goals g on g.id = m.goal_id
left join task_stats ts on ts.milestone_id = m.id
left join entry_stats es on es.milestone_id = m.id
where g.user_id = auth.uid();

-- 2. Vista milestone_status
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
  case
    when b.completed then 'completed'
    else public.pace_status(
      b.actual_value,
      coalesce(b.target_value_for_pace, 0) * b.elapsed_fraction,
      b.target_value_for_pace,
      coalesce(b.period_end, b.end_date::date)
    )
  end as status
from base b;

-- 3. Vista goals_overview
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
    (count(m.id) filter (where coalesce(m.completed, m.closed_at is not null)))::int as done_milestones,
    coalesce(sum(m.total_contributed), 0)::numeric as milestones_contributed
  from public.milestones_overview m
  group by m.goal_id
),
unassigned_entries as (
  select
    pe.goal_id,
    coalesce(sum(pe.amount), 0)::numeric as unassigned_contributed
  from public.progress_entries pe
  where pe.milestone_id is null
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
  (coalesce(ms.milestones_contributed, 0) + coalesce(ue.unassigned_contributed, 0))::numeric as total_contributed,
  case
    when g.target_value is not null and g.target_value > 0 then
      least(100, round((coalesce(ms.milestones_contributed, 0) + coalesce(ue.unassigned_contributed, 0)) / g.target_value * 100, 2))
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
      greatest(g.target_value - (coalesce(ms.milestones_contributed, 0) + coalesce(ue.unassigned_contributed, 0)), 0)
    else null
  end as remaining_value
from public.goals g
left join task_stats ts on ts.goal_id = g.id
left join milestone_summary ms on ms.goal_id = g.id
left join unassigned_entries ue on ue.goal_id = g.id
where g.user_id = auth.uid();

-- 4. Vista goal_status
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
    )::int as periods_remaining,
    count(*) filter (
      where m.is_necessary
        and m.closed_at is null
        and (m.completed is null or not m.completed)
        and coalesce(m.period_end, m.end_date::date) < current_date
    )::int as overdue_milestones
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
    coalesce(mt.periods_remaining, 0) as periods_remaining,
    coalesce(mt.overdue_milestones, 0) as overdue_milestones
  from public.goals_overview g
  left join milestone_totals mt on mt.goal_id = g.id
),
classified as (
  select
    b.*,
    case
      when b.target_value_for_pace is not null and b.actual_value >= b.target_value_for_pace then 'completed'
      when b.overdue_milestones > 0 then 'at_risk'
      else public.pace_status(
        b.actual_value,
        b.expected_value,
        b.target_value_for_pace,
        b.deadline::date
      )
    end as status_value
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

-- Permisos y seguridad
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

grant select on public.milestones_overview to authenticated;
grant select on public.milestone_status to authenticated;
grant select on public.goals_overview to authenticated;
grant select on public.goal_status to authenticated;

notify pgrst, 'reload schema';
