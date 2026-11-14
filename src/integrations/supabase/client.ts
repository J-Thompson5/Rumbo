import { createClient } from "@supabase/supabase-js";

const viteEnv = import.meta.env;
const nodeEnv = typeof process !== "undefined" ? process.env : undefined;

const supabaseUrl =
  (viteEnv["VITE_SUPABASE_URL"] as string | undefined) ?? nodeEnv?.["SUPABASE_URL"] ?? "";
const supabaseKey =
  (viteEnv["VITE_SUPABASE_ANON_KEY"] as string | undefined) ??
  (viteEnv["VITE_SUPABASE_PUBLISHABLE_KEY"] as string | undefined) ??
  nodeEnv?.["SUPABASE_ANON_KEY"] ??
  nodeEnv?.["SUPABASE_PUBLISHABLE_KEY"] ??
  "";

function createSupabaseClient() {
  if (!supabaseUrl || !supabaseKey) {
    throw new Error(
      "Faltan las variables de entorno de Supabase (VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY).",
    );
  }

  return createClient(supabaseUrl, supabaseKey, {
    auth: {
      persistSession: typeof window !== "undefined",
      autoRefreshToken: typeof window !== "undefined",
      detectSessionInUrl: typeof window !== "undefined",
      // PKCE en lugar del flujo implícito: los enlaces mágicos y OAuth llegan
      // con un código efímero intercambiable, no con tokens en la URL.
      flowType: "pkce",
    },
  });
}

let client: ReturnType<typeof createSupabaseClient> | undefined;

// Se crea de forma perezosa para que el módulo también pueda importarse durante
// el render del servidor sin tocar el almacenamiento del navegador.
export const supabase = new Proxy({} as ReturnType<typeof createSupabaseClient>, {
  get(_target, property, receiver) {
    if (!client) client = createSupabaseClient();
    return Reflect.get(client, property, receiver);
  },
});
