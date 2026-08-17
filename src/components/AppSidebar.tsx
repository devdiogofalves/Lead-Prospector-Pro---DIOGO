import {
  LayoutDashboard,
  Users,
  Rocket,
  Kanban,
  Wifi,
  Database,
  RefreshCw,
  Bot,
  MapPin,
  FileSearch,
  Linkedin,
  Send,
  Mail,
  Gem,
  Compass,
  Instagram,
  Zap,
  Brain,
  Sparkles,
  Activity,
  LifeBuoy,
  Calendar,
  KeyRound,
  Palette,
  ShieldCheck,
  Crown,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { NavLink } from "@/components/NavLink";
import { useBranding } from "@/hooks/useBranding";
import { useSupportUnread } from "@/hooks/useSupportUnread";
import { useAdminSupportUnread } from "@/hooks/useAdminSupportUnread";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "react-router-dom";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarHeader,
  SidebarFooter,
  useSidebar,
} from "@/components/ui/sidebar";

const startItems = [
  { title: "Comece Aqui", url: "/", icon: Compass },
  { title: "Dashboard", url: "/dashboard", icon: LayoutDashboard },
];

const prospecaoItems = [
  { title: "Google Maps", url: "/buscas/maps", icon: MapPin },
  { title: "Instagram", url: "/buscas/instagram", icon: Instagram },
  { title: "Grupos WhatsApp", url: "/buscas/whatsapp-grupos", icon: Users },
  { title: "Consulta CNPJ", url: "/buscas/cnpj", icon: FileSearch },
  { title: "DadosBooster", url: "/buscas/dados4u", icon: Database },
  { title: "Meus Leads", url: "/meus-leads", icon: Users },
  { title: "Leads Enriquecidos", url: "/enriquecidos", icon: Gem },
  { title: "Prospecção Automática", url: "/automacao", icon: Zap },
];

const whatsappItems = [
  { title: "DisparoBooster (Campanhas)", url: "/disparo-booster", icon: Rocket },
  { title: "Disparo Humanizado", url: "/disparo-humanizado", icon: Send },
  { title: "📥 Inbox Unificado", url: "/qualificacao-conversas", icon: Bot },
  { title: "Follow-ups", url: "/follow-ups", icon: RefreshCw },
];

const canaisItems = [
  { title: "Disparo por E-mail", url: "/disparo-email", icon: Mail },
  { title: "Instagram DM", url: "/disparo-instagram", icon: Instagram },
  { title: "Telegram", url: "/disparo-telegram", icon: Send },
  { title: "Postagem", url: "/conteudo", icon: Send },
];

const linkedinItems = [
  { title: "Buscar Leads LinkedIn", url: "/buscas/linkedin", icon: Linkedin },
  { title: "LinkedIn DM", url: "/buscas/linkedin-dm", icon: Send },
];

const maviItems = [
  { title: "Treinar IA", url: "/assistente", icon: Brain },
  { title: "🔍 Prompt Preview", url: "/prompt-preview", icon: FileSearch },
  { title: "Pipeline CRM", url: "/pipeline", icon: Kanban },
];

const integrationsItems = [
  { title: "Canais (LinkedIn/Email/IG/TG)", url: "/configuracoes/canais", icon: Wifi },
  { title: "WhatsApp", url: "/whatsapp", icon: Wifi },
  { title: "Google Calendar", url: "/google-calendar", icon: Calendar },
  { title: "APIs", url: "/configuracoes", icon: KeyRound },
];

const accountItems = [
  { title: "Identidade da Empresa", url: "/configuracoes/branding", icon: Palette },
  { title: "Métricas", url: "/metricas", icon: Activity },
  { title: "Saúde do Sistema", url: "/saude", icon: Activity },
];



export function AppSidebar() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const location = useLocation();
  const { branding } = useBranding();
  const supportUnread = useSupportUnread();
  const adminSupportUnread = useAdminSupportUnread();
  const { user } = useAuth();

  // Usa a flag is_admin do metadata — sem expor email no bundle JS.
  const isAdmin = user?.user_metadata?.is_admin === true;

  const { data: subscription } = useQuery({
    queryKey: ["sidebar_subscription", user?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("client_subscriptions")
        .select("reseller_enabled")
        .eq("user_id", user!.id)
        .maybeSingle();
      return data;
    },
    enabled: !!user && !isAdmin,
    staleTime: 5 * 60 * 1000,
  });

  const isReseller = subscription?.reseller_enabled === true;
  const isActive = (path: string) =>
    path === "/" ? location.pathname === "/" : location.pathname.startsWith(path);

  const renderItems = (items: typeof prospecaoItems) =>
    items.map((item) => (
      <SidebarMenuItem key={item.title}>
        <SidebarMenuButton asChild isActive={isActive(item.url)} tooltip={item.title}>
          <NavLink
            to={item.url}
            end={item.url === "/"}
            activeClassName="bg-sidebar-accent text-sidebar-accent-foreground"
          >
            <item.icon className="h-4 w-4" />
            {!collapsed && <span>{item.title}</span>}
          </NavLink>
        </SidebarMenuButton>
      </SidebarMenuItem>
    ));

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="p-4">
        <div className="flex items-center gap-3">
          {branding.logo_url ? (
            <img
              src={branding.logo_url}
              alt={branding.company_name}
              className="h-9 w-9 shrink-0 rounded-lg object-cover bg-sidebar-accent"
            />
          ) : (
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg gradient-primary">
              <Bot className="h-5 w-5 text-white" />
            </div>
          )}
          {!collapsed && (
            <div className="animate-slide-in min-w-0">
              <h2 className="text-sm font-display font-bold text-primary leading-tight truncate drop-shadow-[0_0_8px_hsl(var(--primary)/0.5)]">
                {branding.company_name}
              </h2>
              <p className="text-[10px] text-sidebar-foreground/70 truncate font-mono uppercase tracking-wider">
                powered by {branding.agent_name}
              </p>
            </div>
          )}
        </div>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Início</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>{renderItems(startItems)}</SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel>Prospecção</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>{renderItems(prospecaoItems)}</SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel>WhatsApp</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>{renderItems(whatsappItems)}</SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel>Outros Canais</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>{renderItems(canaisItems)}</SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel>LinkedIn</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>{renderItems(linkedinItems)}</SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel>{branding.agent_name} — IA</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>{renderItems(maviItems)}</SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel>Integrações</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>{renderItems(integrationsItems)}</SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {/* Seção exclusiva WhiteLabel / Admin */}
        {(isAdmin || isReseller) && (
          <SidebarGroup>
            <SidebarGroupLabel>{isAdmin ? "Administração" : "WhiteLabel"}</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {isAdmin && (
                  <SidebarMenuItem>
                    <SidebarMenuButton asChild isActive={isActive("/admin")} tooltip="Painel Admin">
                      <NavLink to="/admin" activeClassName="bg-sidebar-accent text-sidebar-accent-foreground">
                        <ShieldCheck className="h-4 w-4" />
                        {!collapsed && (
                          <span className="flex-1 flex items-center justify-between">
                            <span>Painel Admin</span>
                            {adminSupportUnread > 0 && (
                              <span className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white text-[10px] font-bold animate-pulse">
                                {adminSupportUnread}
                              </span>
                            )}
                          </span>
                        )}
                      </NavLink>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                )}
                {isReseller && (
                  <SidebarMenuItem>
                    <SidebarMenuButton asChild isActive={isActive("/reseller")} tooltip="Meus Clientes">
                      <NavLink to="/reseller" activeClassName="bg-sidebar-accent text-sidebar-accent-foreground">
                        <Crown className="h-4 w-4 text-amber-400" />
                        {!collapsed && <span>Meus Clientes</span>}
                      </NavLink>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                )}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}

        <SidebarGroup>
          <SidebarGroupLabel>Conta</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {renderItems(accountItems)}
              <SidebarMenuItem>
                <SidebarMenuButton asChild isActive={isActive("/suporte")} tooltip="Suporte">
                  <NavLink
                    to="/suporte"
                    activeClassName="bg-sidebar-accent text-sidebar-accent-foreground"
                  >
                    <LifeBuoy className="h-4 w-4" />
                    {!collapsed && (
                      <span className="flex items-center gap-2">
                        Falar com Suporte
                        {supportUnread > 0 && (
                          <Badge variant="destructive" className="h-5 px-1.5 text-[10px]">
                            {supportUnread}
                          </Badge>
                        )}
                      </span>
                    )}
                  </NavLink>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

      </SidebarContent>

      <SidebarFooter className="p-4">
        {!collapsed && (
          <div className="rounded-lg bg-sidebar-accent p-3 animate-fade-in">
            <p className="text-xs font-semibold text-primary">
              {branding.company_name}
            </p>
            <p className="text-xs text-sidebar-foreground/60 mt-0.5">
              {branding.agent_tagline}
            </p>
            <div className="mt-2 flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-success animate-pulse-soft" />
              <span className="text-xs text-success">{branding.agent_name} online</span>
            </div>
          </div>
        )}
      </SidebarFooter>
    </Sidebar>
  );
}
