import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import type { User } from "@supabase/supabase-js";
import { LayoutDashboard, LogOut, Palette, Settings, Target } from "lucide-react";

import { Logo } from "@/components/Logo";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  useSidebar,
} from "@/components/ui/sidebar";
import { supabase } from "@/integrations/supabase/client";

const mainItems = [
  { to: "/panel", label: "Panel general", icon: LayoutDashboard },
  { to: "/objetivos", label: "Mis objetivos", icon: Target },
] as const;

const accountItems = [
  { to: "/preferencias", label: "Preferencias", icon: Palette },
  { to: "/configuracion", label: "Configuración", icon: Settings },
] as const;

export function displayName(user: User) {
  const meta = user.user_metadata ?? {};
  return (
    (meta["full_name"] as string | undefined) ||
    (meta["name"] as string | undefined) ||
    user.email ||
    ""
  );
}

export function AppSidebar({ user }: { user: User }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { isMobile, setOpenMobile } = useSidebar();

  const closeOnMobile = () => {
    if (isMobile) setOpenMobile(false);
  };

  async function handleSignOut() {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  const renderItems = (items: typeof mainItems | typeof accountItems) =>
    items.map((item) => {
      const active = pathname === item.to || pathname.startsWith(`${item.to}/`);
      return (
        <SidebarMenuItem key={item.to}>
          <SidebarMenuButton
            asChild
            isActive={active}
            tooltip={item.label}
            className="h-10 rounded-xl"
          >
            <Link to={item.to} onClick={closeOnMobile}>
              <item.icon />
              <span>{item.label}</span>
            </Link>
          </SidebarMenuButton>
        </SidebarMenuItem>
      );
    });

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="px-3 py-4 group-data-[collapsible=icon]:px-2">
        <div className="overflow-hidden">
          <Logo />
        </div>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Avance</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>{renderItems(mainItems)}</SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
        <SidebarGroup>
          <SidebarGroupLabel>Tu cuenta</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>{renderItems(accountItems)}</SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter>
        <div className="truncate px-2 text-xs text-muted-foreground group-data-[collapsible=icon]:hidden">
          {displayName(user)}
        </div>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              onClick={handleSignOut}
              tooltip="Cerrar sesión"
              className="h-10 rounded-xl"
            >
              <LogOut />
              <span>Cerrar sesión</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
