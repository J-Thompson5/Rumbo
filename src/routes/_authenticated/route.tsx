import { createFileRoute, Outlet, redirect, useRouteContext } from "@tanstack/react-router";

import { AppSidebar } from "@/components/AppSidebar";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async ({ location }) => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) {
      throw redirect({ to: "/auth", search: { redirect: location.href } });
    }
    return { user: data.user };
  },
  component: AuthenticatedLayout,
});

function AuthenticatedLayout() {
  const { user } = useRouteContext({ from: "/_authenticated" });

  return (
    <SidebarProvider>
      <AppSidebar user={user} />
      <SidebarInset className="min-h-screen bg-mist">
        <header className="sticky top-0 z-20 flex items-center gap-2 border-b bg-background/80 px-3 py-2.5 backdrop-blur">
          <SidebarTrigger aria-label="Abrir o cerrar el menú" className="size-9 rounded-full" />
          <span className="text-sm font-medium text-muted-foreground">Menú</span>
        </header>
        <main className="mx-auto w-full max-w-3xl px-5 pb-24 pt-6">
          <Outlet />
        </main>
      </SidebarInset>
    </SidebarProvider>
  );
}
