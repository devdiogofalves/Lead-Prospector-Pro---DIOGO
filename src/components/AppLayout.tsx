import { Outlet } from "react-router-dom";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { Header } from "@/components/Header";
import { OnboardingWizard } from "@/components/OnboardingWizard";
import { OperationalBanner } from "@/components/OperationalBanner";

export default function AppLayout() {
  return (
    <SidebarProvider>
      <div
        className="pointer-events-none fixed inset-0 z-0 bg-[radial-gradient(ellipse_at_center,transparent_0%,hsl(160_15%_3%/.85)_85%)]"
        aria-hidden
      />
      <div
        className="pointer-events-none fixed inset-0 z-0 opacity-[0.06] mix-blend-overlay"
        style={{
          backgroundImage:
            "repeating-linear-gradient(0deg, hsl(142 100% 50% / 0.4) 0px, hsl(142 100% 50% / 0.4) 1px, transparent 1px, transparent 3px)",
        }}
        aria-hidden
      />

      <div className="min-h-screen flex w-full bg-transparent relative z-10">
        <AppSidebar />

        <div className="flex-1 flex flex-col min-w-0">
          <div className="flex items-center gap-2 border-b border-primary/20 bg-background/40 backdrop-blur-md sticky top-0 z-40">
            <SidebarTrigger className="ml-2 text-primary hover:text-primary hover:bg-primary/10" />
            <div className="flex-1">
              <Header />
            </div>
          </div>

          <main className="flex-1 container mx-auto px-3 md:px-6 py-3 md:py-6 space-y-4 md:space-y-6 max-w-screen-2xl">
            <OperationalBanner />
            <Outlet />
          </main>
        </div>
        <OnboardingWizard />
      </div>
    </SidebarProvider>
  );
}
