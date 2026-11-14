import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { z } from "zod";

import { Logo } from "@/components/Logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";

const searchSchema = z.object({ redirect: z.string().optional() });

function safeRedirect(value: string | undefined) {
  if (!value) return "/objetivos";
  try {
    const url = new URL(value, window.location.origin);
    if (url.origin !== window.location.origin) return "/objetivos";
    return url.pathname + url.search;
  } catch {
    return "/objetivos";
  }
}

export const Route = createFileRoute("/auth")({
  validateSearch: searchSchema,
  head: () => ({
    meta: [
      { title: "Entrar — Rumbo" },
      { name: "description", content: "Inicia sesión o crea tu cuenta para seguir tus objetivos." },
      { property: "og:title", content: "Entrar — Rumbo" },
      { property: "og:description", content: "Inicia sesión para seguir tus objetivos." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AuthPage,
});

type Mode = "signin" | "signup" | "forgot";
type OAuthProviderId = "google" | "github" | "apple";

const OAUTH_PROVIDERS: { id: OAuthProviderId; label: string }[] = [
  { id: "google", label: "Continuar con Google" },
  { id: "github", label: "Continuar con GitHub" },
  { id: "apple", label: "Continuar con Apple" },
];

type AuthSettings = {
  external?: Record<string, boolean | undefined>;
};

/**
 * Lee la configuración pública de Supabase Auth y solo muestra los proveedores
 * OAuth que de verdad están habilitados en el proyecto. Así no aparece un botón
 * que no funciona si Google/GitHub todavía no están configurados.
 */
function useEnabledOAuthProviders() {
  const [providers, setProviders] = useState<OAuthProviderId[]>([]);

  useEffect(() => {
    const url = import.meta.env["VITE_SUPABASE_URL"];
    const key =
      import.meta.env["VITE_SUPABASE_ANON_KEY"] ?? import.meta.env["VITE_SUPABASE_PUBLISHABLE_KEY"];
    if (!url || !key) return;

    let cancelled = false;

    fetch(`${url.replace(/\/+$/, "")}/auth/v1/settings`, { headers: { apikey: key } })
      .then((response) => (response.ok ? (response.json() as Promise<AuthSettings>) : null))
      .then((settings) => {
        if (cancelled || !settings?.external) return;
        const available = OAUTH_PROVIDERS.map((provider) => provider.id).filter(
          (id) => settings.external?.[id] === true,
        );
        setProviders(available);
      })
      .catch(() => {
        // Sin red o sin configuración: simplemente no mostramos OAuth.
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return providers;
}

function AuthPage() {
  const { redirect } = Route.useSearch();
  const navigate = useNavigate();
  const oauthProviders = useEnabledOAuthProviders();
  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [sentConfirm, setSentConfirm] = useState(false);

  useEffect(() => {
    const goNext = () => {
      const stored = sessionStorage.getItem("rumbo:after-auth") ?? undefined;
      sessionStorage.removeItem("rumbo:after-auth");
      navigate({ to: safeRedirect(redirect ?? stored), replace: true });
    };
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) goNext();
    });
    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_IN" && session) goNext();
    });
    return () => data.subscription.unsubscribe();
  }, [navigate, redirect]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      if (mode === "signin") {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      } else if (mode === "signup") {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: window.location.origin + safeRedirect(redirect) },
        });
        if (error) throw error;
        if (!data.session) setSentConfirm(true);
      } else {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: `${window.location.origin}/reset-password`,
        });
        if (error) throw error;
        toast.success("Te enviamos un enlace para cambiar tu contraseña.");
        setMode("signin");
      }
    } catch (err) {
      toast.error(translateError(err));
    } finally {
      setLoading(false);
    }
  }

  async function handleMagicLink() {
    if (!email.trim()) {
      toast.error("Escribe tu correo para enviarte el enlace.");
      return;
    }

    setLoading(true);
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: {
        emailRedirectTo: window.location.origin + safeRedirect(redirect),
      },
    });
    setLoading(false);

    if (error) {
      toast.error(translateError(error));
      return;
    }

    toast.success("Revisa tu correo: te enviamos un enlace para entrar.");
  }

  async function handleOAuth(provider: OAuthProviderId) {
    sessionStorage.setItem("rumbo:after-auth", safeRedirect(redirect));
    const { error } = await supabase.auth.signInWithOAuth({
      provider,
      options: { redirectTo: window.location.origin + "/auth" },
    });
    if (error) toast.error("No pudimos iniciar sesión con ese proveedor.");
  }

  const title =
    mode === "signin"
      ? "Bienvenido de vuelta"
      : mode === "signup"
        ? "Crea tu cuenta"
        : "Recupera tu acceso";

  return (
    <div className="min-h-screen bg-mist px-5 py-6">
      <div className="mx-auto max-w-sm">
        <Logo />
        <div className="mt-10 rounded-3xl border bg-card p-6 shadow-lift animate-rise">
          {sentConfirm ? (
            <div className="text-center">
              <h1 className="text-2xl font-bold">Revisa tu correo</h1>
              <p className="mt-2 text-sm text-muted-foreground">
                Te enviamos un enlace a <strong className="text-foreground">{email}</strong> para
                confirmar tu cuenta.
              </p>
              <Button
                variant="outline"
                className="mt-6 w-full"
                onClick={() => {
                  setSentConfirm(false);
                  setMode("signin");
                }}
              >
                Volver a iniciar sesión
              </Button>
            </div>
          ) : (
            <>
              <h1 className="text-2xl font-bold">{title}</h1>
              <p className="mt-1 text-sm text-muted-foreground">
                {mode === "forgot"
                  ? "Escribe tu correo y te enviaremos un enlace."
                  : "Tus objetivos te esperan."}
              </p>

              {mode !== "forgot" && (
                <div className="mt-6 grid gap-2">
                  {oauthProviders.map((provider) => (
                    <Button
                      key={provider}
                      type="button"
                      variant="outline"
                      className="w-full"
                      onClick={() => handleOAuth(provider)}
                    >
                      {provider === "google" ? (
                        <GoogleIcon />
                      ) : provider === "github" ? (
                        <GitHubIcon />
                      ) : (
                        <AppleIcon />
                      )}
                      {OAUTH_PROVIDERS.find((item) => item.id === provider)?.label}
                    </Button>
                  ))}
                  {oauthProviders.length > 0 && (
                    <div className="my-3 flex items-center gap-3 text-xs text-muted-foreground">
                      <span className="h-px flex-1 bg-border" />o con tu correo
                      <span className="h-px flex-1 bg-border" />
                    </div>
                  )}
                </div>
              )}

              <form
                onSubmit={handleSubmit}
                className={mode === "forgot" ? "mt-6 grid gap-4" : "grid gap-4"}
              >
                <div className="grid gap-1.5">
                  <Label htmlFor="email">Correo</Label>
                  <Input
                    id="email"
                    type="email"
                    autoComplete="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </div>
                {mode !== "forgot" && (
                  <div className="grid gap-1.5">
                    <div className="flex items-center justify-between">
                      <Label htmlFor="password">Contraseña</Label>
                      {mode === "signin" && (
                        <button
                          type="button"
                          className="text-xs font-medium text-primary hover:underline"
                          onClick={() => setMode("forgot")}
                        >
                          ¿La olvidaste?
                        </button>
                      )}
                    </div>
                    <Input
                      id="password"
                      type="password"
                      autoComplete={mode === "signup" ? "new-password" : "current-password"}
                      required
                      // El mínimo de 8 solo aplica al crear cuenta: un usuario
                      // existente con contraseña corta debe poder entrar.
                      minLength={mode === "signup" ? 8 : undefined}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                    />
                  </div>
                )}
                <Button type="submit" variant="hero" className="w-full" disabled={loading}>
                  {loading
                    ? "Un momento…"
                    : mode === "signin"
                      ? "Iniciar sesión"
                      : mode === "signup"
                        ? "Crear cuenta"
                        : "Enviar enlace"}
                </Button>
              </form>

              {mode !== "forgot" && (
                <Button
                  type="button"
                  variant="ghost"
                  className="mt-3 w-full"
                  disabled={loading}
                  onClick={handleMagicLink}
                >
                  Enviarme un enlace de acceso
                </Button>
              )}

              <p className="mt-5 text-center text-sm text-muted-foreground">
                {mode === "signup"
                  ? "¿Ya tienes cuenta? "
                  : mode === "signin"
                    ? "¿Eres nuevo? "
                    : ""}
                <button
                  type="button"
                  className="font-semibold text-primary hover:underline"
                  onClick={() =>
                    setMode(mode === "signup" || mode === "forgot" ? "signin" : "signup")
                  }
                >
                  {mode === "signin" ? "Crea una cuenta" : "Inicia sesión"}
                </button>
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function translateError(err: unknown) {
  const msg = err instanceof Error ? err.message : String(err);
  if (/invalid login/i.test(msg)) return "Correo o contraseña incorrectos.";
  if (/email not confirmed/i.test(msg)) return "Confirma tu correo antes de entrar.";
  if (/already registered/i.test(msg)) return "Ese correo ya tiene una cuenta.";
  if (/password/i.test(msg) && /weak|short|least/i.test(msg))
    return "La contraseña es muy débil. Usa al menos 8 caracteres.";
  return "Algo salió mal. Intenta de nuevo.";
}

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M22.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.4h5.9a5 5 0 0 1-2.2 3.3v2.7h3.5c2.1-1.9 3.3-4.7 3.3-8.1Z"
      />
      <path
        fill="#34A853"
        d="M12 23c3 0 5.5-1 7.3-2.7l-3.5-2.7c-1 .7-2.3 1.1-3.8 1.1-2.9 0-5.4-2-6.3-4.6H2.1v2.8A11 11 0 0 0 12 23Z"
      />
      <path fill="#FBBC05" d="M5.7 14.1a6.6 6.6 0 0 1 0-4.2V7.1H2.1a11 11 0 0 0 0 9.8l3.6-2.8Z" />
      <path
        fill="#EA4335"
        d="M12 5.4c1.6 0 3.1.6 4.2 1.7l3.1-3.1A11 11 0 0 0 2.1 7.1l3.6 2.8C6.6 7.4 9.1 5.4 12 5.4Z"
      />
    </svg>
  );
}

function GitHubIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" fill="currentColor">
      <path d="M12 .8a11.2 11.2 0 0 0-3.5 21.8c.6.1.8-.2.8-.5v-2c-3.1.7-3.8-1.3-3.8-1.3-.5-1.3-1.2-1.6-1.2-1.6-1-.7.1-.7.1-.7 1.1.1 1.7 1.1 1.7 1.1 1 1.7 2.6 1.2 3.2.9.1-.7.4-1.2.7-1.5-2.5-.3-5.1-1.2-5.1-5.2 0-1.2.4-2.1 1.1-2.9-.1-.3-.5-1.4.1-2.9 0 0 .9-.3 3 1.1a10.5 10.5 0 0 1 5.5 0c2.1-1.4 3-1.1 3-1.1.6 1.5.2 2.6.1 2.9.7.8 1.1 1.7 1.1 2.9 0 4-2.6 4.9-5.1 5.2.4.3.8 1 .8 2.1v3.1c0 .3.2.6.8.5A11.2 11.2 0 0 0 12 .8Z" />
    </svg>
  );
}

function AppleIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" fill="currentColor">
      <path d="M16.7 12.8c0-2.1 1.7-3.1 1.8-3.2a4 4 0 0 0-3.1-1.7c-1.3-.1-2.5.8-3.2.8-.7 0-1.7-.8-2.8-.8a4.1 4.1 0 0 0-3.5 2.1c-1.5 2.6-.4 6.4 1.1 8.5.7 1 1.6 2.2 2.7 2.1 1.1 0 1.5-.7 2.9-.7s1.8.7 3 .7c1.2 0 2-1.1 2.8-2.1.9-1.3 1.2-2.6 1.2-2.7-.1 0-2.9-1.1-2.9-3Zm-2.1-6.2c.6-.8 1-1.9.9-3-.9 0-2 .6-2.6 1.4-.6.7-1.1 1.8-1 2.8 1 .1 2-.5 2.7-1.2Z" />
    </svg>
  );
}
