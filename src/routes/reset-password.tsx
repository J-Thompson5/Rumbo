import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";
import { toast } from "sonner";

import { Logo } from "@/components/Logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/reset-password")({
  head: () => ({
    meta: [
      { title: "Nueva contraseña — Rumbo" },
      { name: "description", content: "Elige una nueva contraseña para tu cuenta de Rumbo." },
      { property: "og:title", content: "Nueva contraseña — Rumbo" },
      { property: "og:description", content: "Elige una nueva contraseña para tu cuenta." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: ResetPasswordPage,
});

function ResetPasswordPage() {
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  // Solo el enlace de recuperación (o una sesión ya activa) permiten cambiar la
  // contraseña aquí. Si GoTrue no encuentra sesión al inicializar, fuera.
  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "INITIAL_SESSION" && !session) {
        navigate({ to: "/auth", replace: true });
      }
    });
    return () => data.subscription.unsubscribe();
  }, [navigate]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password });
    setLoading(false);
    if (error) {
      toast.error("No pudimos cambiar la contraseña. Pide un enlace nuevo.");
      return;
    }
    toast.success("Contraseña actualizada.");
    navigate({ to: "/objetivos", replace: true });
  }

  return (
    <div className="min-h-screen bg-mist px-5 py-6">
      <div className="mx-auto max-w-sm">
        <Logo />
        <form
          onSubmit={handleSubmit}
          className="mt-10 grid gap-4 rounded-3xl border bg-card p-6 shadow-lift"
        >
          <div>
            <h1 className="text-2xl font-bold">Nueva contraseña</h1>
            <p className="mt-1 text-sm text-muted-foreground">Escríbela y listo.</p>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="new-password">Contraseña</Label>
            <Input
              id="new-password"
              type="password"
              autoComplete="new-password"
              minLength={8}
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          <Button type="submit" variant="hero" disabled={loading}>
            {loading ? "Guardando…" : "Guardar contraseña"}
          </Button>
        </form>
      </div>
    </div>
  );
}
