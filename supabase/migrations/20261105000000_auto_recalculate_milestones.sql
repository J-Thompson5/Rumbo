-- ============================================================================
-- Fractal · Recálculo automático de hitos al registrar aportes
-- ============================================================================
-- Se ha corregido el trigger para que no intente recalcular si la meta fue eliminada.
-- ============================================================================

create or replace function public.trigger_recalculate_goal_milestones()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (tg_op = 'DELETE') then
    -- Solo recalcular si la meta aún existe
    if exists (select 1 from public.goals where id = old.goal_id) then
      perform public.recalculate_goal_milestones(old.goal_id);
    end if;
    return old;
  else
    perform public.recalculate_goal_milestones(new.goal_id);
    return new;
  end if;
end;
$$;

drop trigger if exists trigger_recalculate_goal_milestones on public.progress_entries;
create trigger trigger_recalculate_goal_milestones
after insert or update or delete on public.progress_entries
for each row execute function public.trigger_recalculate_goal_milestones();
