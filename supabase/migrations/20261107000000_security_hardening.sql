-- ============================================================================
-- Fractal · Endurecimiento de permisos de funciones
-- ============================================================================
-- El esquema remoto define:
--   ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public"
--     GRANT ALL ON FUNCTIONS TO "anon";
-- Eso hace que cualquier función nueva creada por postgres en public sea
-- ejecutable por el rol anónimo sin GRANT explícito. Si alguien crea una
-- función SECURITY DEFINER que confía en auth.uid() para autorizar, un
-- visitante anónimo podría llamarla con auth.uid() = NULL.
--
-- Esta migración revoca ese default y aclara que las funciones de trigger no
-- son para llamadas directas desde la API. Las funciones que la app usa de
-- verdad (generate_goal_milestones, recalculate_goal_milestones, vistas y
-- pace_status) conservan sus GRANT a "authenticated"; nada cambia en runtime.
-- ============================================================================

-- 1. Ninguna función futura será ejecutable por anon sin GRANT explícito.
alter default privileges for role "postgres" in schema "public"
  revoke all on functions from "anon";

-- 2. Funciones de trigger: EXECUTE directo no sirve para nada desde la API
--    (se ejecutan vía trigger) y no deben estar expuestas.
revoke execute on function public.set_task_completed_at() from "anon";
revoke execute on function public.trigger_recalculate_goal_milestones() from "anon";
revoke execute on function public.validate_progress_entry_milestone() from "anon";

-- 3. Defensa en profundidad para las SECURITY DEFINER: explícito que anon
--    no puede ejecutarlas (ya estaba revocado de PUBLIC; esto lo documenta
--    y sobrevive a cualquier GRANT posterior por accidente).
revoke execute on function
  public.generate_goal_milestones(bigint, text, text, numeric) from "anon";
revoke execute on function
  public.recalculate_goal_milestones(bigint) from "anon";

notify pgrst, 'reload schema';
