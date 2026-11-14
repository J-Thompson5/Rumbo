


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "supabase_vault" WITH SCHEMA "vault";






CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";





SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."milestones" (
    "id" bigint NOT NULL,
    "goal_id" bigint NOT NULL,
    "parent_id" bigint,
    "title" "text" NOT NULL,
    "type" "text" NOT NULL,
    "start_date" "date",
    "end_date" "date",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "period_start" "date",
    "period_end" "date",
    "target_value" numeric(14,2),
    "is_necessary" boolean DEFAULT true NOT NULL,
    "closed_at" timestamp with time zone,
    "completed" boolean DEFAULT false NOT NULL,
    "completed_at" timestamp with time zone,
    "description" "text",
    CONSTRAINT "milestones_check" CHECK ((("end_date" IS NULL) OR ("start_date" IS NULL) OR ("end_date" >= "start_date"))),
    CONSTRAINT "milestones_check1" CHECK ((("parent_id" IS NULL) OR ("parent_id" <> "id"))),
    CONSTRAINT "milestones_target_value_non_negative" CHECK ((("target_value" IS NULL) OR ("target_value" >= (0)::numeric))),
    CONSTRAINT "milestones_title_check" CHECK ((("char_length"("title") >= 1) AND ("char_length"("title") <= 255))),
    CONSTRAINT "milestones_type_check" CHECK (("type" = ANY (ARRAY['monthly'::"text", 'weekly'::"text"])))
);


ALTER TABLE "public"."milestones" OWNER TO "postgres";


COMMENT ON COLUMN "public"."milestones"."type" IS 'Periodicidad del hito: monthly o weekly. El refactor la muestra como mensual o semanal.';



COMMENT ON COLUMN "public"."milestones"."period_end" IS 'Fecha límite del hito. El refactor la muestra como due_date.';



COMMENT ON COLUMN "public"."milestones"."closed_at" IS 'Cierre del hito. Se mantiene sincronizado con completed/completed_at.';



COMMENT ON COLUMN "public"."milestones"."completed" IS 'Hito completado. Se mantiene sincronizado con closed_at.';



CREATE OR REPLACE FUNCTION "public"."generate_goal_milestones"("p_goal_id" bigint, "p_periodicity" "text" DEFAULT 'monthly'::"text", "p_mode" "text" DEFAULT 'deadline'::"text", "p_contribution" numeric DEFAULT NULL::numeric) RETURNS SETOF "public"."milestones"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_goal public.goals%rowtype;
  v_start date;
  v_deadline date;
  v_period_count integer := 0;
  v_base numeric;
  v_total_contributed numeric;
  v_amount numeric;
  v_last_amount numeric;
  v_i integer;
  v_period_start date;
  v_period_end date;
  v_next_start date;
  v_existing integer;
  v_title text;
begin
  if p_periodicity is null or p_periodicity not in ('monthly', 'weekly') then
    raise exception 'Periodicidad inválida. Usa monthly o weekly.'
      using errcode = '22023';
  end if;

  if p_mode is null or p_mode not in ('deadline', 'contribution') then
    raise exception 'Modo inválido. Usa deadline o contribution.'
      using errcode = '22023';
  end if;

  select *
  into v_goal
  from public.goals
  where id = p_goal_id;

  if not found then
    raise exception 'No existe la meta %.', p_goal_id
      using errcode = 'P0002';
  end if;

  -- Defensa extra además de la RLS (la función es security definer).
  if auth.uid() is not null and v_goal.user_id is distinct from auth.uid() then
    raise exception 'No tienes permiso sobre esta meta.'
      using errcode = '42501';
  end if;

  if v_goal.target_value is null or v_goal.target_value <= 0 then
    raise exception 'La meta % no tiene un valor objetivo válido.', p_goal_id
      using errcode = '22023';
  end if;

  select count(*)
  into v_existing
  from public.milestones
  where goal_id = p_goal_id
    and target_value is not null;

  if v_existing > 0 then
    return query
      select *
      from public.milestones
      where goal_id = p_goal_id
      order by period_start nulls last, id;
    return;
  end if;

  v_start := coalesce(v_goal.start_date, current_date);

  if v_goal.start_date is null then
    update public.goals
    set start_date = v_start
    where id = p_goal_id;
  end if;

  select coalesce(sum(pe.amount), 0)
  into v_total_contributed
  from public.progress_entries pe
  where pe.goal_id = p_goal_id;

  v_base := greatest(v_goal.target_value - v_total_contributed, 0);

  if v_base <= 0 then
    raise exception 'La meta % ya está completada.', p_goal_id
      using errcode = '22023';
  end if;

  if p_mode = 'deadline' then
    v_deadline := v_goal.deadline::date;

    if v_deadline is null then
      raise exception 'La meta % no tiene fecha límite para el modo fecha.', p_goal_id
        using errcode = '22023';
    end if;

    if v_deadline <= v_start then
      raise exception 'La fecha límite debe ser posterior a la fecha de inicio.'
        using errcode = '22023';
    end if;

    loop
      v_period_start := case
        when p_periodicity = 'monthly'
          then (v_start + (v_period_count::text || ' months')::interval)::date
        else v_start + (v_period_count * 7)
      end;

      exit when v_period_start >= v_deadline;
      v_period_count := v_period_count + 1;
    end loop;
  else
    if p_contribution is null or p_contribution <= 0 then
      raise exception 'El aporte periódico debe ser mayor que cero.'
        using errcode = '22023';
    end if;

    v_amount := round(p_contribution, 2);

    if v_amount <= 0 then
      raise exception 'El aporte periódico es demasiado pequeño.'
        using errcode = '22023';
    end if;

    v_period_count := ceil(v_base / v_amount)::integer;

    -- Fecha estimada: start_date + ceil(target / aporte) períodos.
    v_deadline := case
      when p_periodicity = 'monthly'
        then (v_start + (v_period_count::text || ' months')::interval - interval '1 day')::date
      else v_start + (v_period_count * 7) - 1
    end;

    update public.goals
    set deadline = v_deadline
    where id = p_goal_id;
  end if;

  if v_period_count <= 0 then
    raise exception 'No se generaron períodos para la meta %.', p_goal_id
      using errcode = '22023';
  end if;

  -- Límite de seguridad para evitar generar millones de hitos por error.
  if v_period_count > 5200 then
    raise exception 'La planificación genera demasiados períodos (%). Ajusta el aporte o la fecha.', v_period_count
      using errcode = '22023';
  end if;

  if p_mode = 'deadline' then
    -- trunc evita que el último período quede negativo por redondeo.
    v_amount := trunc(v_base / v_period_count, 2);
    v_last_amount := v_base - (v_amount * (v_period_count - 1));
  else
    v_last_amount := v_base - (v_amount * (v_period_count - 1));
  end if;

  for v_i in 1..v_period_count loop
    v_period_start := case
      when p_periodicity = 'monthly'
        then (v_start + ((v_i - 1)::text || ' months')::interval)::date
      else v_start + ((v_i - 1) * 7)
    end;

    v_next_start := case
      when p_periodicity = 'monthly'
        then (v_start + (v_i::text || ' months')::interval)::date
      else v_start + (v_i * 7)
    end;

    if v_i = v_period_count then
      v_period_end := v_deadline;
    else
      v_period_end := v_next_start - 1;
    end if;

    v_title := case
      when p_periodicity = 'monthly' then format('Mes %s', v_i)
      else format('Semana %s', v_i)
    end;

    insert into public.milestones (
      goal_id,
      title,
      type,
      start_date,
      end_date,
      period_start,
      period_end,
      target_value,
      is_necessary
    ) values (
      p_goal_id,
      v_title,
      p_periodicity,
      v_period_start,
      v_period_end,
      v_period_start,
      v_period_end,
      case when v_i = v_period_count then v_last_amount else v_amount end,
      true
    );
  end loop;

  return query
    select *
    from public.milestones
    where goal_id = p_goal_id
    order by period_start nulls last, id;
end;
$$;


ALTER FUNCTION "public"."generate_goal_milestones"("p_goal_id" bigint, "p_periodicity" "text", "p_mode" "text", "p_contribution" numeric) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."pace_status"("p_actual" numeric, "p_expected" numeric, "p_target" numeric, "p_deadline" "date") RETURNS "text"
    LANGUAGE "plpgsql" STABLE
    SET "search_path" TO 'public'
    AS $$
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


ALTER FUNCTION "public"."pace_status"("p_actual" numeric, "p_expected" numeric, "p_target" numeric, "p_deadline" "date") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."period_elapsed_fraction"("p_start" "date", "p_end" "date", "p_as_of" "date" DEFAULT CURRENT_DATE) RETURNS numeric
    LANGUAGE "sql" STABLE
    SET "search_path" TO 'public'
    AS $$
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


ALTER FUNCTION "public"."period_elapsed_fraction"("p_start" "date", "p_end" "date", "p_as_of" "date") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."recalculate_goal_milestones"("p_goal_id" bigint) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_goal public.goals%rowtype;
  v_total numeric;
  v_remaining numeric;
  v_future_count integer;
  v_per_amount numeric;
  v_last_amount numeric;
  v_i integer := 0;
  r record;
begin
  select *
  into v_goal
  from public.goals
  where id = p_goal_id;

  if not found then
    raise exception 'No existe la meta %.', p_goal_id
      using errcode = 'P0002';
  end if;

  if auth.uid() is not null and v_goal.user_id is distinct from auth.uid() then
    raise exception 'No tienes permiso sobre esta meta.'
      using errcode = '42501';
  end if;

  -- Las metas no medibles conservan el comportamiento actual basado en tareas.
  if v_goal.target_value is null or v_goal.target_value <= 0 then
    return;
  end if;

  select coalesce(sum(pe.amount), 0)
  into v_total
  from public.progress_entries pe
  where pe.goal_id = p_goal_id;

  v_remaining := greatest(v_goal.target_value - v_total, 0);

  if v_remaining <= 0 then
    update public.milestones m
    set is_necessary = false
    where m.goal_id = p_goal_id
      and coalesce(m.period_start, m.start_date::date) > current_date
      and m.closed_at is null
      and m.is_necessary = true;

    return;
  end if;

  -- Si la meta vuelve a tener saldo pendiente (por ejemplo, se eliminó un
  -- aporte), los hitos futuros que se habían marcado como no necesarios
  -- vuelven a ser necesarios. Los cerrados no se tocan.
  update public.milestones m
  set is_necessary = true
  where m.goal_id = p_goal_id
    and coalesce(m.period_start, m.start_date::date) > current_date
    and m.closed_at is null
    and m.is_necessary = false;

  select count(*)
  into v_future_count
  from public.milestones m
  where m.goal_id = p_goal_id
    and coalesce(m.period_start, m.start_date::date) > current_date
    and m.closed_at is null
    and m.is_necessary = true;

  if v_future_count = 0 then
    return;
  end if;

  -- trunc evita que el último período quede negativo por redondeo.
  v_per_amount := trunc(v_remaining / v_future_count, 2);
  v_last_amount := v_remaining - (v_per_amount * (v_future_count - 1));

  for r in
    select m.id
    from public.milestones m
    where m.goal_id = p_goal_id
      and coalesce(m.period_start, m.start_date::date) > current_date
      and m.closed_at is null
      and m.is_necessary = true
    order by coalesce(m.period_start, m.start_date::date), m.id
  loop
    v_i := v_i + 1;

    update public.milestones
    set target_value = case
      when v_i = v_future_count then v_last_amount
      else v_per_amount
    end
    where id = r.id;
  end loop;
end;
$$;


ALTER FUNCTION "public"."recalculate_goal_milestones"("p_goal_id" bigint) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_task_completed_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
begin
  if new.is_completed and (tg_op = 'INSERT' or not old.is_completed) then
    new.completed_at = now();
  elsif not new.is_completed then
    new.completed_at = null;
  end if;
  return new;
end;
$$;


ALTER FUNCTION "public"."set_task_completed_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."trigger_recalculate_goal_milestones"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
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


ALTER FUNCTION "public"."trigger_recalculate_goal_milestones"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."validate_progress_entry_milestone"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  if new.milestone_id is not null then
    if not exists (
      select 1
      from public.milestones m
      where m.id = new.milestone_id
        and m.goal_id = new.goal_id
    ) then
      raise exception 'El hito % no pertenece a la meta %.', new.milestone_id, new.goal_id
        using errcode = '23514';
    end if;
  end if;

  return new;
end;
$$;


ALTER FUNCTION "public"."validate_progress_entry_milestone"() OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."goals" (
    "id" bigint NOT NULL,
    "user_id" "uuid" DEFAULT "auth"."uid"() NOT NULL,
    "title" "text" NOT NULL,
    "description" "text",
    "deadline" "date",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "target_value" numeric(14,2),
    "unit" "text",
    "start_date" "date",
    CONSTRAINT "goals_target_value_positive" CHECK ((("target_value" IS NULL) OR ("target_value" > (0)::numeric))),
    CONSTRAINT "goals_title_check" CHECK ((("char_length"("title") >= 1) AND ("char_length"("title") <= 255)))
);


ALTER TABLE "public"."goals" OWNER TO "postgres";


COMMENT ON COLUMN "public"."goals"."deadline" IS 'Fecha meta del objetivo. El refactor la muestra como target_date.';



CREATE TABLE IF NOT EXISTS "public"."progress_entries" (
    "id" bigint NOT NULL,
    "goal_id" bigint NOT NULL,
    "milestone_id" bigint,
    "amount" numeric(14,2) NOT NULL,
    "entry_date" "date" DEFAULT CURRENT_DATE NOT NULL,
    "note" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "progress_entries_amount_positive" CHECK (("amount" > (0)::numeric))
);


ALTER TABLE "public"."progress_entries" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."tasks" (
    "id" bigint NOT NULL,
    "milestone_id" bigint NOT NULL,
    "title" "text" NOT NULL,
    "due_date" "date" NOT NULL,
    "is_completed" boolean DEFAULT false NOT NULL,
    "completed_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "tasks_title_check" CHECK ((("char_length"("title") >= 1) AND ("char_length"("title") <= 255)))
);


ALTER TABLE "public"."tasks" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."milestones_overview" WITH ("security_invoker"='true') AS
 WITH "task_stats" AS (
         SELECT "t"."milestone_id",
            ("count"(*))::integer AS "total_tasks",
            ("count"(*) FILTER (WHERE "t"."is_completed"))::integer AS "done_tasks"
           FROM "public"."tasks" "t"
          WHERE ("t"."milestone_id" IS NOT NULL)
          GROUP BY "t"."milestone_id"
        ), "entry_stats" AS (
         SELECT "m_1"."id" AS "milestone_id",
            COALESCE("sum"("pe"."amount"), (0)::numeric) AS "entries_sum"
           FROM ("public"."milestones" "m_1"
             LEFT JOIN "public"."progress_entries" "pe" ON ((("pe"."goal_id" = "m_1"."goal_id") AND (("pe"."milestone_id" = "m_1"."id") OR (("pe"."milestone_id" IS NULL) AND (("pe"."entry_date" >= COALESCE("m_1"."period_start", "m_1"."start_date")) AND ("pe"."entry_date" <= COALESCE("m_1"."period_end", "m_1"."end_date"))))))))
          GROUP BY "m_1"."id"
        )
 SELECT "m"."id",
    "m"."goal_id",
    "m"."parent_id",
    "m"."title",
    "m"."type",
    "m"."start_date",
    "m"."end_date",
    "m"."created_at",
    "m"."period_start",
    "m"."period_end",
    "m"."target_value",
    "m"."is_necessary",
    "m"."closed_at",
    COALESCE("ts"."total_tasks", 0) AS "total_tasks",
    COALESCE("ts"."done_tasks", 0) AS "done_tasks",
        CASE
            WHEN (COALESCE("m"."completed", ("m"."closed_at" IS NOT NULL)) AND ("m"."target_value" IS NOT NULL)) THEN GREATEST("m"."target_value", COALESCE("es"."entries_sum", (0)::numeric))
            ELSE COALESCE("es"."entries_sum", (0)::numeric)
        END AS "total_contributed",
        CASE
            WHEN (("m"."target_value" IS NOT NULL) AND ("m"."target_value" > (0)::numeric)) THEN LEAST((100)::numeric, "round"(((
            CASE
                WHEN COALESCE("m"."completed", ("m"."closed_at" IS NOT NULL)) THEN GREATEST("m"."target_value", COALESCE("es"."entries_sum", (0)::numeric))
                ELSE COALESCE("es"."entries_sum", (0)::numeric)
            END / "m"."target_value") * (100)::numeric), 2))
            WHEN ("m"."target_value" = (0)::numeric) THEN (100)::numeric
            WHEN COALESCE("m"."completed", ("m"."closed_at" IS NOT NULL)) THEN (100)::numeric
            WHEN (("m"."target_value" IS NULL) AND (COALESCE("ts"."total_tasks", 0) > 0)) THEN "round"((((COALESCE("ts"."done_tasks", 0))::numeric / ("ts"."total_tasks")::numeric) * (100)::numeric), 2)
            ELSE (0)::numeric
        END AS "progress_percentage",
        CASE
            WHEN ("m"."target_value" IS NOT NULL) THEN GREATEST(("m"."target_value" -
            CASE
                WHEN COALESCE("m"."completed", ("m"."closed_at" IS NOT NULL)) THEN GREATEST("m"."target_value", COALESCE("es"."entries_sum", (0)::numeric))
                ELSE COALESCE("es"."entries_sum", (0)::numeric)
            END), (0)::numeric)
            ELSE NULL::numeric
        END AS "remaining_value",
    COALESCE("m"."completed", ("m"."closed_at" IS NOT NULL)) AS "completed",
    "m"."completed_at"
   FROM ((("public"."milestones" "m"
     JOIN "public"."goals" "g" ON (("g"."id" = "m"."goal_id")))
     LEFT JOIN "task_stats" "ts" ON (("ts"."milestone_id" = "m"."id")))
     LEFT JOIN "entry_stats" "es" ON (("es"."milestone_id" = "m"."id")))
  WHERE ("g"."user_id" = "auth"."uid"());


ALTER VIEW "public"."milestones_overview" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."goals_overview" WITH ("security_invoker"='true') AS
 WITH "task_stats" AS (
         SELECT "m"."goal_id",
            ("count"("t"."id"))::integer AS "total_tasks",
            ("count"("t"."id") FILTER (WHERE "t"."is_completed"))::integer AS "done_tasks"
           FROM ("public"."milestones" "m"
             LEFT JOIN "public"."tasks" "t" ON (("t"."milestone_id" = "m"."id")))
          GROUP BY "m"."goal_id"
        ), "milestone_summary" AS (
         SELECT "m"."goal_id",
            ("count"("m"."id"))::integer AS "total_milestones",
            ("count"("m"."id") FILTER (WHERE COALESCE("m"."completed", ("m"."closed_at" IS NOT NULL))))::integer AS "done_milestones",
            COALESCE("sum"("m"."total_contributed"), (0)::numeric) AS "milestones_contributed"
           FROM "public"."milestones_overview" "m"
          GROUP BY "m"."goal_id"
        ), "unassigned_entries" AS (
         SELECT "pe"."goal_id",
            COALESCE("sum"("pe"."amount"), (0)::numeric) AS "unassigned_contributed"
           FROM "public"."progress_entries" "pe"
          WHERE ("pe"."milestone_id" IS NULL)
          GROUP BY "pe"."goal_id"
        )
 SELECT "g"."id",
    "g"."user_id",
    "g"."title",
    "g"."description",
    "g"."deadline",
    "g"."created_at",
    "g"."target_value",
    "g"."unit",
    "g"."start_date",
    COALESCE("ts"."total_tasks", 0) AS "total_tasks",
    COALESCE("ts"."done_tasks", 0) AS "done_tasks",
    COALESCE("ms"."total_milestones", 0) AS "total_milestones",
    COALESCE("ms"."done_milestones", 0) AS "done_milestones",
    (COALESCE("ms"."milestones_contributed", (0)::numeric) + COALESCE("ue"."unassigned_contributed", (0)::numeric)) AS "total_contributed",
        CASE
            WHEN (("g"."target_value" IS NOT NULL) AND ("g"."target_value" > (0)::numeric)) THEN LEAST((100)::numeric, "round"((((COALESCE("ms"."milestones_contributed", (0)::numeric) + COALESCE("ue"."unassigned_contributed", (0)::numeric)) / "g"."target_value") * (100)::numeric), 2))
            WHEN (COALESCE("ts"."total_tasks", 0) > 0) THEN "round"((((COALESCE("ts"."done_tasks", 0))::numeric / ("ts"."total_tasks")::numeric) * (100)::numeric), 2)
            WHEN (COALESCE("ms"."total_milestones", 0) > 0) THEN "round"((((COALESCE("ms"."done_milestones", 0))::numeric / ("ms"."total_milestones")::numeric) * (100)::numeric), 2)
            ELSE (0)::numeric
        END AS "progress_percentage",
        CASE
            WHEN ("g"."target_value" IS NOT NULL) THEN 'amount'::"text"
            ELSE 'tasks'::"text"
        END AS "progress_mode",
        CASE
            WHEN ("g"."target_value" IS NOT NULL) THEN GREATEST(("g"."target_value" - (COALESCE("ms"."milestones_contributed", (0)::numeric) + COALESCE("ue"."unassigned_contributed", (0)::numeric))), (0)::numeric)
            ELSE NULL::numeric
        END AS "remaining_value"
   FROM ((("public"."goals" "g"
     LEFT JOIN "task_stats" "ts" ON (("ts"."goal_id" = "g"."id")))
     LEFT JOIN "milestone_summary" "ms" ON (("ms"."goal_id" = "g"."id")))
     LEFT JOIN "unassigned_entries" "ue" ON (("ue"."goal_id" = "g"."id")))
  WHERE ("g"."user_id" = "auth"."uid"());


ALTER VIEW "public"."goals_overview" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."goal_status" WITH ("security_invoker"='true') AS
 WITH "milestone_totals" AS (
         SELECT "m"."goal_id",
            "sum"((COALESCE("m"."target_value", (0)::numeric) * "public"."period_elapsed_fraction"(COALESCE("m"."period_start", "m"."start_date"), COALESCE("m"."period_end", "m"."end_date"), CURRENT_DATE))) AS "expected_amount",
            ("count"(*) FILTER (WHERE ("m"."is_necessary" AND ("m"."closed_at" IS NULL) AND (("m"."completed" IS NULL) OR (NOT "m"."completed")) AND (COALESCE("m"."period_end", "m"."end_date") >= CURRENT_DATE))))::integer AS "periods_remaining",
            ("count"(*) FILTER (WHERE ("m"."is_necessary" AND ("m"."closed_at" IS NULL) AND (("m"."completed" IS NULL) OR (NOT "m"."completed")) AND (COALESCE("m"."period_end", "m"."end_date") < CURRENT_DATE))))::integer AS "overdue_milestones"
           FROM "public"."milestones_overview" "m"
          GROUP BY "m"."goal_id"
        ), "base" AS (
         SELECT "g"."id",
            "g"."user_id",
            "g"."title",
            "g"."description",
            "g"."deadline",
            "g"."created_at",
            "g"."target_value",
            "g"."unit",
            "g"."start_date",
            "g"."total_tasks",
            "g"."done_tasks",
            "g"."total_milestones",
            "g"."done_milestones",
            "g"."total_contributed",
            "g"."progress_percentage",
            "g"."progress_mode",
            "g"."remaining_value",
                CASE
                    WHEN ("g"."progress_mode" = 'amount'::"text") THEN COALESCE("mt"."expected_amount", (0)::numeric)
                    ELSE "public"."period_elapsed_fraction"(COALESCE("g"."start_date", ("g"."created_at")::"date"), "g"."deadline", CURRENT_DATE)
                END AS "expected_value",
                CASE
                    WHEN ("g"."progress_mode" = 'amount'::"text") THEN "g"."total_contributed"
                    WHEN (COALESCE("g"."total_tasks", 0) > 0) THEN "round"((("g"."done_tasks")::numeric / ("g"."total_tasks")::numeric), 4)
                    WHEN (COALESCE("g"."total_milestones", 0) > 0) THEN "round"((("g"."done_milestones")::numeric / ("g"."total_milestones")::numeric), 4)
                    ELSE (0)::numeric
                END AS "actual_value",
                CASE
                    WHEN ("g"."progress_mode" = 'amount'::"text") THEN "g"."target_value"
                    WHEN ((COALESCE("g"."total_tasks", 0) > 0) OR (COALESCE("g"."total_milestones", 0) > 0)) THEN (1)::numeric
                    ELSE NULL::numeric
                END AS "target_value_for_pace",
            COALESCE("mt"."periods_remaining", 0) AS "periods_remaining",
            COALESCE("mt"."overdue_milestones", 0) AS "overdue_milestones"
           FROM ("public"."goals_overview" "g"
             LEFT JOIN "milestone_totals" "mt" ON (("mt"."goal_id" = "g"."id")))
        ), "classified" AS (
         SELECT "b"."id",
            "b"."user_id",
            "b"."title",
            "b"."description",
            "b"."deadline",
            "b"."created_at",
            "b"."target_value",
            "b"."unit",
            "b"."start_date",
            "b"."total_tasks",
            "b"."done_tasks",
            "b"."total_milestones",
            "b"."done_milestones",
            "b"."total_contributed",
            "b"."progress_percentage",
            "b"."progress_mode",
            "b"."remaining_value",
            "b"."expected_value",
            "b"."actual_value",
            "b"."target_value_for_pace",
            "b"."periods_remaining",
            "b"."overdue_milestones",
                CASE
                    WHEN (("b"."target_value_for_pace" IS NOT NULL) AND ("b"."actual_value" >= "b"."target_value_for_pace")) THEN 'completed'::"text"
                    WHEN ("b"."overdue_milestones" > 0) THEN 'at_risk'::"text"
                    ELSE "public"."pace_status"("b"."actual_value", "b"."expected_value", "b"."target_value_for_pace", "b"."deadline")
                END AS "status_value"
           FROM "base" "b"
        )
 SELECT "id",
    "user_id",
    "title",
    "description",
    "deadline",
    "created_at",
    "target_value",
    "unit",
    "start_date",
    "total_tasks",
    "done_tasks",
    "total_milestones",
    "done_milestones",
    "total_contributed",
    "progress_percentage",
    "progress_mode",
    "remaining_value",
    "expected_value" AS "expected",
    "actual_value" AS "actual",
        CASE
            WHEN ("expected_value" > (0)::numeric) THEN "round"(("actual_value" / "expected_value"), 4)
            ELSE NULL::numeric
        END AS "ratio",
    "status_value" AS "status",
    "periods_remaining",
        CASE
            WHEN (("progress_mode" = 'amount'::"text") AND ("target_value" IS NOT NULL) AND ("target_value" > (0)::numeric) AND ("periods_remaining" > 0) AND ("status_value" = 'at_risk'::"text")) THEN "round"((GREATEST(("target_value" - "actual_value"), (0)::numeric) / ("periods_remaining")::numeric), 2)
            ELSE NULL::numeric
        END AS "required_per_period"
   FROM "classified" "c";


ALTER VIEW "public"."goal_status" OWNER TO "postgres";


ALTER TABLE "public"."goals" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."goals_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE OR REPLACE VIEW "public"."goals_progress" AS
SELECT
    NULL::bigint AS "id",
    NULL::"uuid" AS "user_id",
    NULL::"text" AS "title",
    NULL::"text" AS "description",
    NULL::"date" AS "deadline",
    NULL::timestamp with time zone AS "created_at",
    NULL::bigint AS "total_tasks",
    NULL::bigint AS "done_tasks",
    NULL::numeric AS "progress_percentage";


ALTER VIEW "public"."goals_progress" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."milestone_cards" WITH ("security_invoker"='true') AS
 SELECT "m"."id",
    "m"."goal_id",
    "g"."user_id",
    "m"."title",
        CASE
            WHEN ("lower"(COALESCE("m"."type", ''::"text")) = ANY (ARRAY['weekly'::"text", 'semanal'::"text", 'week'::"text"])) THEN 'semanal'::"text"
            ELSE 'mensual'::"text"
        END AS "period",
    COALESCE("m"."period_end", "m"."end_date") AS "due_date",
    "m"."completed",
    "m"."completed_at",
    "m"."created_at"
   FROM ("public"."milestones" "m"
     JOIN "public"."goals" "g" ON (("g"."id" = "m"."goal_id")));


ALTER VIEW "public"."milestone_cards" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."milestone_status" WITH ("security_invoker"='true') AS
 WITH "base" AS (
         SELECT "mo"."id",
            "mo"."goal_id",
            "mo"."parent_id",
            "mo"."title",
            "mo"."type",
            "mo"."start_date",
            "mo"."end_date",
            "mo"."created_at",
            "mo"."period_start",
            "mo"."period_end",
            "mo"."target_value",
            "mo"."is_necessary",
            "mo"."closed_at",
            "mo"."total_tasks",
            "mo"."done_tasks",
            "mo"."total_contributed",
            "mo"."progress_percentage",
            "mo"."remaining_value",
            "mo"."completed",
            "mo"."completed_at",
            "public"."period_elapsed_fraction"(COALESCE("mo"."period_start", "mo"."start_date"), COALESCE("mo"."period_end", "mo"."end_date"), CURRENT_DATE) AS "elapsed_fraction",
                CASE
                    WHEN ("mo"."target_value" IS NOT NULL) THEN "mo"."total_contributed"
                    WHEN "mo"."completed" THEN (1)::numeric
                    WHEN (COALESCE("mo"."total_tasks", 0) > 0) THEN "round"((("mo"."done_tasks")::numeric / ("mo"."total_tasks")::numeric), 4)
                    ELSE (0)::numeric
                END AS "actual_value",
                CASE
                    WHEN ("mo"."target_value" IS NOT NULL) THEN "mo"."target_value"
                    WHEN ("mo"."completed" OR (COALESCE("mo"."total_tasks", 0) > 0)) THEN (1)::numeric
                    ELSE NULL::numeric
                END AS "target_value_for_pace"
           FROM "public"."milestones_overview" "mo"
        )
 SELECT "id",
    "goal_id",
    "parent_id",
    "title",
    "type",
    "start_date",
    "end_date",
    "created_at",
    "period_start",
    "period_end",
    "target_value",
    "is_necessary",
    "closed_at",
    "completed",
    "completed_at",
    "total_tasks",
    "done_tasks",
    "total_contributed",
    "progress_percentage",
    "remaining_value",
    (COALESCE("target_value_for_pace", (0)::numeric) * "elapsed_fraction") AS "expected",
    "actual_value" AS "actual",
        CASE
            WHEN ((COALESCE("target_value_for_pace", (0)::numeric) > (0)::numeric) AND ("elapsed_fraction" > (0)::numeric)) THEN "round"(("actual_value" / ("target_value_for_pace" * "elapsed_fraction")), 4)
            ELSE NULL::numeric
        END AS "ratio",
        CASE
            WHEN "completed" THEN 'completed'::"text"
            ELSE "public"."pace_status"("actual_value", (COALESCE("target_value_for_pace", (0)::numeric) * "elapsed_fraction"), "target_value_for_pace", COALESCE("period_end", "end_date"))
        END AS "status"
   FROM "base" "b";


ALTER VIEW "public"."milestone_status" OWNER TO "postgres";


ALTER TABLE "public"."milestones" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."milestones_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE OR REPLACE VIEW "public"."milestones_progress" AS
SELECT
    NULL::bigint AS "id",
    NULL::bigint AS "goal_id",
    NULL::bigint AS "parent_id",
    NULL::"text" AS "title",
    NULL::"text" AS "type",
    NULL::"date" AS "start_date",
    NULL::"date" AS "end_date",
    NULL::timestamp with time zone AS "created_at",
    NULL::bigint AS "total_tasks",
    NULL::bigint AS "done_tasks",
    NULL::numeric AS "progress_percentage";


ALTER VIEW "public"."milestones_progress" OWNER TO "postgres";


ALTER TABLE "public"."progress_entries" ALTER COLUMN "id" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME "public"."progress_entries_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



ALTER TABLE "public"."tasks" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."tasks_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



ALTER TABLE ONLY "public"."goals"
    ADD CONSTRAINT "goals_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."milestones"
    ADD CONSTRAINT "milestones_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."progress_entries"
    ADD CONSTRAINT "progress_entries_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."tasks"
    ADD CONSTRAINT "tasks_pkey" PRIMARY KEY ("id");



CREATE INDEX "goals_user_created_at_idx" ON "public"."goals" USING "btree" ("user_id", "created_at" DESC);



CREATE INDEX "goals_user_id_idx" ON "public"."goals" USING "btree" ("user_id");



CREATE INDEX "milestones_goal_completed_idx" ON "public"."milestones" USING "btree" ("goal_id", "completed");



CREATE INDEX "milestones_goal_id_idx" ON "public"."milestones" USING "btree" ("goal_id");



CREATE INDEX "milestones_goal_period_end_idx" ON "public"."milestones" USING "btree" ("goal_id", "period_end");



CREATE INDEX "milestones_goal_period_idx" ON "public"."milestones" USING "btree" ("goal_id", "period_start");



CREATE INDEX "milestones_parent_id_idx" ON "public"."milestones" USING "btree" ("parent_id");



CREATE INDEX "progress_entries_goal_date_idx" ON "public"."progress_entries" USING "btree" ("goal_id", "entry_date");



CREATE INDEX "progress_entries_milestone_idx" ON "public"."progress_entries" USING "btree" ("milestone_id");



CREATE INDEX "tasks_due_date_idx" ON "public"."tasks" USING "btree" ("due_date");



CREATE INDEX "tasks_milestone_id_idx" ON "public"."tasks" USING "btree" ("milestone_id");



CREATE OR REPLACE VIEW "public"."goals_progress" WITH ("security_invoker"='true') AS
 SELECT "g"."id",
    "g"."user_id",
    "g"."title",
    "g"."description",
    "g"."deadline",
    "g"."created_at",
    "count"("t"."id") AS "total_tasks",
    "count"("t"."id") FILTER (WHERE "t"."is_completed") AS "done_tasks",
        CASE
            WHEN ("count"("t"."id") > 0) THEN "round"(((100.0 * ("count"("t"."id") FILTER (WHERE "t"."is_completed"))::numeric) / ("count"("t"."id"))::numeric), 2)
            ELSE (0)::numeric
        END AS "progress_percentage"
   FROM (("public"."goals" "g"
     LEFT JOIN "public"."milestones" "m" ON (("m"."goal_id" = "g"."id")))
     LEFT JOIN "public"."tasks" "t" ON (("t"."milestone_id" = "m"."id")))
  GROUP BY "g"."id";



CREATE OR REPLACE VIEW "public"."milestones_progress" WITH ("security_invoker"='true') AS
 WITH RECURSIVE "tree" AS (
         SELECT "milestones"."id" AS "root_id",
            "milestones"."id" AS "node_id"
           FROM "public"."milestones"
        UNION
         SELECT "tr_1"."root_id",
            "m_1"."id"
           FROM ("tree" "tr_1"
             JOIN "public"."milestones" "m_1" ON (("m_1"."parent_id" = "tr_1"."node_id")))
        )
 SELECT "m"."id",
    "m"."goal_id",
    "m"."parent_id",
    "m"."title",
    "m"."type",
    "m"."start_date",
    "m"."end_date",
    "m"."created_at",
    "count"("t"."id") AS "total_tasks",
    "count"("t"."id") FILTER (WHERE "t"."is_completed") AS "done_tasks",
        CASE
            WHEN ("count"("t"."id") > 0) THEN "round"(((100.0 * ("count"("t"."id") FILTER (WHERE "t"."is_completed"))::numeric) / ("count"("t"."id"))::numeric), 2)
            ELSE (0)::numeric
        END AS "progress_percentage"
   FROM (("public"."milestones" "m"
     JOIN "tree" "tr" ON (("tr"."root_id" = "m"."id")))
     LEFT JOIN "public"."tasks" "t" ON (("t"."milestone_id" = "tr"."node_id")))
  GROUP BY "m"."id";



CREATE OR REPLACE TRIGGER "tasks_set_completed_at" BEFORE INSERT OR UPDATE OF "is_completed" ON "public"."tasks" FOR EACH ROW EXECUTE FUNCTION "public"."set_task_completed_at"();



CREATE OR REPLACE TRIGGER "trigger_recalculate_goal_milestones" AFTER INSERT OR DELETE OR UPDATE ON "public"."progress_entries" FOR EACH ROW EXECUTE FUNCTION "public"."trigger_recalculate_goal_milestones"();



CREATE OR REPLACE TRIGGER "validate_progress_entry_milestone" BEFORE INSERT OR UPDATE ON "public"."progress_entries" FOR EACH ROW EXECUTE FUNCTION "public"."validate_progress_entry_milestone"();



ALTER TABLE ONLY "public"."goals"
    ADD CONSTRAINT "goals_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."milestones"
    ADD CONSTRAINT "milestones_goal_id_fkey" FOREIGN KEY ("goal_id") REFERENCES "public"."goals"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."milestones"
    ADD CONSTRAINT "milestones_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "public"."milestones"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."progress_entries"
    ADD CONSTRAINT "progress_entries_goal_id_fkey" FOREIGN KEY ("goal_id") REFERENCES "public"."goals"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."progress_entries"
    ADD CONSTRAINT "progress_entries_milestone_id_fkey" FOREIGN KEY ("milestone_id") REFERENCES "public"."milestones"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."tasks"
    ADD CONSTRAINT "tasks_milestone_id_fkey" FOREIGN KEY ("milestone_id") REFERENCES "public"."milestones"("id") ON DELETE CASCADE;



ALTER TABLE "public"."goals" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "goals: dueño" ON "public"."goals" TO "authenticated" USING (("user_id" = ( SELECT "auth"."uid"() AS "uid"))) WITH CHECK (("user_id" = ( SELECT "auth"."uid"() AS "uid")));



ALTER TABLE "public"."milestones" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "milestones: dueño del goal" ON "public"."milestones" TO "authenticated" USING (("goal_id" IN ( SELECT "goals"."id"
   FROM "public"."goals"
  WHERE ("goals"."user_id" = ( SELECT "auth"."uid"() AS "uid"))))) WITH CHECK (("goal_id" IN ( SELECT "goals"."id"
   FROM "public"."goals"
  WHERE ("goals"."user_id" = ( SELECT "auth"."uid"() AS "uid")))));



ALTER TABLE "public"."progress_entries" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "progress_entries_delete_own" ON "public"."progress_entries" FOR DELETE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."goals" "g"
  WHERE (("g"."id" = "progress_entries"."goal_id") AND ("g"."user_id" = "auth"."uid"())))));



CREATE POLICY "progress_entries_insert_own" ON "public"."progress_entries" FOR INSERT TO "authenticated" WITH CHECK (((EXISTS ( SELECT 1
   FROM "public"."goals" "g"
  WHERE (("g"."id" = "progress_entries"."goal_id") AND ("g"."user_id" = "auth"."uid"())))) AND (("milestone_id" IS NULL) OR (EXISTS ( SELECT 1
   FROM "public"."milestones" "m"
  WHERE (("m"."id" = "progress_entries"."milestone_id") AND ("m"."goal_id" = "progress_entries"."goal_id")))))));



CREATE POLICY "progress_entries_select_own" ON "public"."progress_entries" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."goals" "g"
  WHERE (("g"."id" = "progress_entries"."goal_id") AND ("g"."user_id" = "auth"."uid"())))));



CREATE POLICY "progress_entries_update_own" ON "public"."progress_entries" FOR UPDATE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."goals" "g"
  WHERE (("g"."id" = "progress_entries"."goal_id") AND ("g"."user_id" = "auth"."uid"()))))) WITH CHECK (((EXISTS ( SELECT 1
   FROM "public"."goals" "g"
  WHERE (("g"."id" = "progress_entries"."goal_id") AND ("g"."user_id" = "auth"."uid"())))) AND (("milestone_id" IS NULL) OR (EXISTS ( SELECT 1
   FROM "public"."milestones" "m"
  WHERE (("m"."id" = "progress_entries"."milestone_id") AND ("m"."goal_id" = "progress_entries"."goal_id")))))));



ALTER TABLE "public"."tasks" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "tasks: dueño del goal" ON "public"."tasks" TO "authenticated" USING (("milestone_id" IN ( SELECT "m"."id"
   FROM ("public"."milestones" "m"
     JOIN "public"."goals" "g" ON (("g"."id" = "m"."goal_id")))
  WHERE ("g"."user_id" = ( SELECT "auth"."uid"() AS "uid"))))) WITH CHECK (("milestone_id" IN ( SELECT "m"."id"
   FROM ("public"."milestones" "m"
     JOIN "public"."goals" "g" ON (("g"."id" = "m"."goal_id")))
  WHERE ("g"."user_id" = ( SELECT "auth"."uid"() AS "uid")))));





ALTER PUBLICATION "supabase_realtime" OWNER TO "postgres";


GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";






















































































































































GRANT ALL ON TABLE "public"."milestones" TO "anon";
GRANT ALL ON TABLE "public"."milestones" TO "authenticated";
GRANT ALL ON TABLE "public"."milestones" TO "service_role";



REVOKE ALL ON FUNCTION "public"."generate_goal_milestones"("p_goal_id" bigint, "p_periodicity" "text", "p_mode" "text", "p_contribution" numeric) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."generate_goal_milestones"("p_goal_id" bigint, "p_periodicity" "text", "p_mode" "text", "p_contribution" numeric) TO "authenticated";
GRANT ALL ON FUNCTION "public"."generate_goal_milestones"("p_goal_id" bigint, "p_periodicity" "text", "p_mode" "text", "p_contribution" numeric) TO "service_role";



REVOKE ALL ON FUNCTION "public"."pace_status"("p_actual" numeric, "p_expected" numeric, "p_target" numeric, "p_deadline" "date") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."pace_status"("p_actual" numeric, "p_expected" numeric, "p_target" numeric, "p_deadline" "date") TO "authenticated";
GRANT ALL ON FUNCTION "public"."pace_status"("p_actual" numeric, "p_expected" numeric, "p_target" numeric, "p_deadline" "date") TO "service_role";



REVOKE ALL ON FUNCTION "public"."period_elapsed_fraction"("p_start" "date", "p_end" "date", "p_as_of" "date") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."period_elapsed_fraction"("p_start" "date", "p_end" "date", "p_as_of" "date") TO "authenticated";
GRANT ALL ON FUNCTION "public"."period_elapsed_fraction"("p_start" "date", "p_end" "date", "p_as_of" "date") TO "service_role";



REVOKE ALL ON FUNCTION "public"."recalculate_goal_milestones"("p_goal_id" bigint) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."recalculate_goal_milestones"("p_goal_id" bigint) TO "authenticated";
GRANT ALL ON FUNCTION "public"."recalculate_goal_milestones"("p_goal_id" bigint) TO "service_role";



GRANT ALL ON FUNCTION "public"."set_task_completed_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."set_task_completed_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_task_completed_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."trigger_recalculate_goal_milestones"() TO "anon";
GRANT ALL ON FUNCTION "public"."trigger_recalculate_goal_milestones"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."trigger_recalculate_goal_milestones"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."validate_progress_entry_milestone"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."validate_progress_entry_milestone"() TO "anon";
GRANT ALL ON FUNCTION "public"."validate_progress_entry_milestone"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."validate_progress_entry_milestone"() TO "service_role";


















GRANT ALL ON TABLE "public"."goals" TO "anon";
GRANT ALL ON TABLE "public"."goals" TO "authenticated";
GRANT ALL ON TABLE "public"."goals" TO "service_role";



GRANT ALL ON TABLE "public"."progress_entries" TO "anon";
GRANT ALL ON TABLE "public"."progress_entries" TO "authenticated";
GRANT ALL ON TABLE "public"."progress_entries" TO "service_role";



GRANT ALL ON TABLE "public"."tasks" TO "anon";
GRANT ALL ON TABLE "public"."tasks" TO "authenticated";
GRANT ALL ON TABLE "public"."tasks" TO "service_role";



GRANT ALL ON TABLE "public"."milestones_overview" TO "anon";
GRANT ALL ON TABLE "public"."milestones_overview" TO "authenticated";
GRANT ALL ON TABLE "public"."milestones_overview" TO "service_role";



GRANT ALL ON TABLE "public"."goals_overview" TO "anon";
GRANT ALL ON TABLE "public"."goals_overview" TO "authenticated";
GRANT ALL ON TABLE "public"."goals_overview" TO "service_role";



GRANT ALL ON TABLE "public"."goal_status" TO "anon";
GRANT ALL ON TABLE "public"."goal_status" TO "authenticated";
GRANT ALL ON TABLE "public"."goal_status" TO "service_role";



GRANT ALL ON SEQUENCE "public"."goals_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."goals_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."goals_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."goals_progress" TO "anon";
GRANT ALL ON TABLE "public"."goals_progress" TO "authenticated";
GRANT ALL ON TABLE "public"."goals_progress" TO "service_role";



GRANT ALL ON TABLE "public"."milestone_cards" TO "anon";
GRANT ALL ON TABLE "public"."milestone_cards" TO "authenticated";
GRANT ALL ON TABLE "public"."milestone_cards" TO "service_role";



GRANT ALL ON TABLE "public"."milestone_status" TO "anon";
GRANT ALL ON TABLE "public"."milestone_status" TO "authenticated";
GRANT ALL ON TABLE "public"."milestone_status" TO "service_role";



GRANT ALL ON SEQUENCE "public"."milestones_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."milestones_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."milestones_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."milestones_progress" TO "anon";
GRANT ALL ON TABLE "public"."milestones_progress" TO "authenticated";
GRANT ALL ON TABLE "public"."milestones_progress" TO "service_role";



GRANT ALL ON SEQUENCE "public"."progress_entries_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."progress_entries_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."progress_entries_id_seq" TO "service_role";



GRANT ALL ON SEQUENCE "public"."tasks_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."tasks_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."tasks_id_seq" TO "service_role";









ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";































