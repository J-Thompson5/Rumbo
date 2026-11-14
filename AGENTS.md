# Fractal — reglas del proyecto

## Stack

- TanStack Start + TanStack Router + TanStack Query.
- React 19, TypeScript, Tailwind CSS v4 y componentes shadcn/ui.
- Supabase para autenticación y datos.

## Base de datos

- La app conserva el esquema que ya existía en Supabase: `goals`, `milestones`,
  `tasks` y `progress_entries`, además de las vistas `goal_status` y
  `milestone_status`.
- El refactor usa nombres simples en la UI (`target_date`, `period`, `due_date`,
  `completed`). La traducción al esquema real vive **solo** en
  `src/lib/goals.ts`. No dupliques esa lógica en componentes.
- Las migraciones viven en `supabase/migrations/`. La migración
  `20261103000000_refactor_bridge.sql` es el puente no destructivo entre ambos
  modelos.
- Toda escritura pasa por el cliente de Supabase del navegador y queda protegida
  por RLS de dueño (`auth.uid()`).

## Autenticación

- Usamos Supabase Auth directamente: correo + contraseña, recuperación de
  contraseña y enlace mágico por correo.
- Los botones OAuth (Google, GitHub, Apple) se muestran únicamente si el
  proveedor está habilitado en Supabase. No se usa ningún SDK de OAuth de
  Lovable.
- Las páginas privadas viven en `src/routes/_authenticated/` y redirigen a
  `/auth`.

## UI

- El panel, los objetivos y los hitos viven en `src/routes/_authenticated/`.
- Las preferencias de color y tamaño de letra se guardan en el navegador
  (`src/lib/preferences.ts`) y se aplican antes del primer render.
- Las reglas puras de progreso y fechas viven en `src/lib/progress.ts` con sus
  pruebas al lado.
