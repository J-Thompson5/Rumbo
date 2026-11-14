import { createFileRoute, useNavigate, useRouteContext, useRouter } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { LogOut } from "lucide-react";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";

import { displayName } from "@/components/AppSidebar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/configuracion")({
  head: () => ({
    meta: [
      { title: "Configuración — Rumbo" },
      { name: "description", content: "Tu nombre, tu contraseña y tu sesión en Rumbo." },
      { property: "og:title", content: "Configuración — Rumbo" },
      { property: "og:description", content: "Administra tu cuenta de Rumbo." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: SettingsPage,
});

function SettingsPage() {
  const { user } = useRouteContext({ from: "/_authenticated" });
  const router = useRouter();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [name, setName] = useState(() =>
    displayName(user) === user.email ? "" : displayName(user),
  );
  const [savingName, setSavingName] = useState(false);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [savingPassword, setSavingPassword] = useState(false);

  async function saveName(e: FormEvent) {
    e.preventDefault();
    setSavingName(true);
    const { error } = await supabase.auth.updateUser({ data: { full_name: name.trim() } });
    setSavingName(false);
    if (error) {
      toast.error("No pudimos guardar tu nombre.");
      return;
    }
    toast.success("Nombre guardado.");
    router.invalidate();
  }

  async function savePassword(e: FormEvent) {
    e.preventDefault();
    if (password !== confirm) {
      toast.error("Las contraseñas no coinciden.");
      return;
    }
    setSavingPassword(true);
    const { error } = await supabase.auth.updateUser({ password });
    setSavingPassword(false);
    if (error) {
      toast.error("No pudimos cambiar la contraseña. Prueba con otra.");
      return;
    }
    setPassword("");
    setConfirm("");
    toast.success("Contraseña actualizada.");
  }

  async function signOut() {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  return (
    <div className="animate-rise">
      <h1 className="text-3xl font-extrabold sm:text-4xl">Configuración</h1>
      <p className="mt-1 text-sm text-muted-foreground">Los datos de tu cuenta.</p>

      <form
        onSubmit={saveName}
        className="mt-6 grid gap-4 rounded-3xl border bg-card p-5 shadow-soft"
      >
        <h2 className="text-lg font-bold">Perfil</h2>
        <div className="grid gap-1.5">
          <Label htmlFor="email">Correo</Label>
          <Input id="email" value={user.email ?? ""} disabled />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="name">Nombre</Label>
          <Input
            id="name"
            value={name}
            maxLength={80}
            placeholder="¿Cómo te llamas?"
            onChange={(e) => setName(e.target.value)}
          />
        </div>
        <Button type="submit" className="justify-self-start" disabled={savingName}>
          {savingName ? "Guardando…" : "Guardar nombre"}
        </Button>
      </form>

      <form
        onSubmit={savePassword}
        className="mt-4 grid gap-4 rounded-3xl border bg-card p-5 shadow-soft"
      >
        <h2 className="text-lg font-bold">Contraseña</h2>
        <div className="grid gap-1.5">
          <Label htmlFor="new-password">Nueva contraseña</Label>
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
        <div className="grid gap-1.5">
          <Label htmlFor="confirm-password">Repite la contraseña</Label>
          <Input
            id="confirm-password"
            type="password"
            autoComplete="new-password"
            minLength={8}
            required
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
          />
        </div>
        <Button type="submit" className="justify-self-start" disabled={savingPassword}>
          {savingPassword ? "Guardando…" : "Cambiar contraseña"}
        </Button>
      </form>

      <section className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-3xl border bg-card p-5 shadow-soft">
        <div>
          <h2 className="text-lg font-bold">Sesión</h2>
          <p className="text-sm text-muted-foreground">Sal de tu cuenta en este dispositivo.</p>
        </div>
        <Button variant="outline" onClick={signOut}>
          <LogOut /> Cerrar sesión
        </Button>
      </section>
    </div>
  );
}
