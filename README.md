# Fractal

App para definir un objetivo principal, dividirlo en hitos semanales y mensuales
y seguir el avance. Este repositorio contiene el refactor completo sobre
TanStack Start y conserva la base de datos que ya usa Fractal en Supabase.

## Requisitos

- Node.js 20.19+ (recomendado 22 o superior).
- Una cuenta/proyecto de Supabase con las migraciones de `supabase/migrations/`
  aplicadas.

## Desarrollo

```sh
npm install
cp .env.example .env
# Edita .env con la URL y la anon key de tu proyecto de Supabase
npm run dev
```

La app queda en `http://localhost:3000`.

## Variables de entorno

```env
VITE_SUPABASE_URL=https://tu-proyecto.supabase.co
VITE_SUPABASE_ANON_KEY=tu-anon-key
```

También se aceptan `VITE_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_URL` y
`SUPABASE_PUBLISHABLE_KEY` para despliegues que usen el formato nuevo de llaves
de Supabase.

## Base de datos

El refactor mantiene el esquema existente:

- `goals` (fecha meta en `deadline`)
- `milestones` (periodicidad en `type`, fecha límite en `period_end`,
  completado en `closed_at`)
- `tasks`
- `progress_entries`
- vistas `goal_status` y `milestone_status`

La adaptación entre esos nombres y los del refactor está en
`src/lib/goals.ts`. La migración `20261103000000_refactor_bridge.sql` agrega las
columnas de compatibilidad (`completed`, `completed_at`), crea la vista
`milestone_cards` y no elimina datos.

Aplica las migraciones desde el SQL Editor de Supabase o con la CLI:

```sh
supabase link --project-ref TU_PROJECT_REF
supabase db push
```

## Autenticación

- Correo y contraseña (incluye recuperación de contraseña).
- Enlace mágico por correo.
- OAuth opcional con Google, GitHub o Apple: los botones aparecen solo cuando el
  proveedor está habilitado en **Supabase → Authentication → Providers**.
  No se usa el OAuth de Lovable.

Si el proyecto tiene la confirmación de correo activa, después del registro hay
que abrir el enlace enviado al correo antes de iniciar sesión.

En **Supabase → Authentication → URL Configuration** agrega la URL de desarrollo
(`http://localhost:3000`) y la URL de producción a **Site URL / Redirect URLs**
para que funcionen la confirmación, el enlace mágico y la recuperación de
contraseña.

## Scripts

```sh
npm run dev        # desarrollo
npm run build      # build de producción
npm run preview    # previsualizar el build
npm run lint       # ESLint
npm run test       # Vitest
npm run format     # Prettier
```
