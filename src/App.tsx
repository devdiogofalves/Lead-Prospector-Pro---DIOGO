import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "./hooks/useAuth";
import { ProtectedRoute } from "./components/ProtectedRoute";
import AppLayout from "./components/AppLayout";

// Core pages
import Dashboard from "./pages/Dashboard";
import ComeceAqui from "./pages/ComeceAqui";
import MeusLeads from "./pages/MeusLeads";
import DisparoHumanizado from "./pages/DisparoHumanizado";
import DisparoBooster from "./pages/DisparoBooster";
import DisparoEmail from "./pages/DisparoEmail";
import DisparoInstagram from "./pages/DisparoInstagram";
import DisparoTelegram from "./pages/DisparoTelegram";
import FollowUps from "./pages/FollowUps";
import Pipeline from "./pages/Pipeline";

// Buscas
import LinkedInPage from "./pages/buscas/LinkedInPage";
import LinkedInDmPage from "./pages/buscas/LinkedInDmPage";
import Dados4uPage from "./pages/buscas/Dados4uPage";
import LinkedInBase from "./pages/bases/LinkedInBase";
import CnpjPage from "./pages/buscas/CnpjPage";
import MapsPage from "./pages/buscas/MapsPage";
import InstagramPage from "./pages/buscas/InstagramPage";
import WhatsAppGruposPage from "./pages/buscas/WhatsAppGruposPage";
import Enriquecidos from "./pages/Enriquecidos";
import Automacao from "./pages/Automacao";
import TreinarMavi from "./pages/TreinarMavi";
import QualificacaoConversas from "./pages/QualificacaoConversas";
import Conteudo from "./pages/Conteudo";

// Configurações
import ApisTab from "./pages/configuracoes/ApisTab";
import CanaisTab from "./pages/configuracoes/CanaisTab";
import BrandingTab from "./pages/configuracoes/BrandingTab";
import WhatsAppTab from "./pages/configuracoes/WhatsAppTab";
import GoogleCalendarTab from "./pages/configuracoes/GoogleCalendarTab";


// Saúde
import Saude from "./pages/Saude";
import Metricas from "./pages/Metricas";
import PromptPreview from "./pages/PromptPreview";

// Admin & Reseller
import Admin from "./pages/Admin";
import Reseller from "./pages/Reseller";

// Suporte
import Suporte from "./pages/Suporte";

// Auth
import Auth from "./pages/Auth";
import ForgotPassword from "./pages/ForgotPassword";
import ResetPassword from "./pages/ResetPassword";
import NotFound from "./pages/NotFound";
import Unsubscribe from "./pages/Unsubscribe";
import BioLink from "./pages/BioLink";
import OAuthConsent from "./pages/OAuthConsent";
import { DataDeletion, PrivacyPolicy, TermsOfService } from "./pages/Legal";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            <Route path="/auth" element={<Auth />} />
            <Route path="/forgot-password" element={<ForgotPassword />} />
            <Route path="/reset-password" element={<ResetPassword />} />
            <Route path="/unsubscribe" element={<Unsubscribe />} />
            <Route path="/bio/:handle" element={<BioLink />} />
            <Route path="/.lovable/oauth/consent" element={<OAuthConsent />} />
            <Route path="/politica-de-privacidade" element={<PrivacyPolicy />} />
            <Route path="/termos-de-uso" element={<TermsOfService />} />
            <Route path="/exclusao-de-dados" element={<DataDeletion />} />


            <Route
              element={
                <ProtectedRoute>
                  <AppLayout />
                </ProtectedRoute>
              }
            >
              {/* Home = Comece Aqui */}
              <Route path="/" element={<ComeceAqui />} />
              <Route path="/dashboard" element={<Dashboard />} />

              {/* Prospecção */}
              <Route path="/buscas/linkedin" element={<LinkedInPage />} />
              <Route path="/buscas/linkedin-dm" element={<LinkedInDmPage />} />
              <Route path="/bases/linkedin" element={<LinkedInBase />} />
              <Route path="/meus-leads" element={<MeusLeads />} />
              <Route path="/enriquecidos" element={<Enriquecidos />} />
              <Route path="/buscas/dados4u" element={<Dados4uPage />} />
              <Route path="/buscas/cnpj" element={<CnpjPage />} />
              <Route path="/buscas/maps" element={<MapsPage />} />
             <Route path="/buscas/instagram" element={<InstagramPage />} />
             <Route path="/buscas/whatsapp-grupos" element={<WhatsAppGruposPage />} />
              <Route path="/automacao" element={<Automacao />} />

              {/* WhatsApp */}
              <Route path="/disparo-booster" element={<DisparoBooster />} />
              <Route path="/disparo-humanizado" element={<DisparoHumanizado />} />
              <Route path="/qualificacao-conversas" element={<QualificacaoConversas />} />
              <Route path="/follow-ups" element={<FollowUps />} />

              {/* Canais adicionais (Unipile) */}
              <Route path="/disparo-email" element={<DisparoEmail />} />
              <Route path="/disparo-instagram" element={<DisparoInstagram />} />
              <Route path="/disparo-telegram" element={<DisparoTelegram />} />

              {/* Postagem automática + auto-DM */}
              <Route path="/conteudo" element={<Conteudo />} />

              {/* IA assistente */}
              <Route path="/assistente" element={<TreinarMavi />} />
              <Route path="/prompt-preview" element={<PromptPreview />} />
              <Route path="/pipeline" element={<Pipeline />} />

              {/* Redirects das rotas antigas */}
              <Route path="/qualificacao-humanizada" element={<Navigate to="/qualificacao-conversas" replace />} />
              <Route path="/conversas" element={<Navigate to="/qualificacao-conversas" replace />} />
              <Route path="/mavi/aprendizado" element={<Navigate to="/assistente" replace />} />

              {/* Configurações */}
              <Route path="/saude" element={<Saude />} />
              <Route path="/metricas" element={<Metricas />} />
              <Route path="/configuracoes" element={<ApisTab />} />
              <Route path="/configuracoes/canais" element={<CanaisTab />} />
              <Route path="/configuracoes/branding" element={<BrandingTab />} />
              <Route path="/whatsapp" element={<WhatsAppTab />} />
              <Route path="/google-calendar" element={<GoogleCalendarTab />} />


              {/* Admin & Reseller */}
              <Route path="/admin" element={<Admin />} />
              <Route path="/reseller" element={<Reseller />} />

              {/* Suporte */}
              <Route path="/suporte" element={<Suporte />} />
            </Route>

            <Route path="*" element={<NotFound />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
