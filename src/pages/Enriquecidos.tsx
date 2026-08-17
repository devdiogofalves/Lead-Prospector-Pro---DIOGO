import { Gem, Building2, Linkedin as LinkedinIcon, Instagram as InstagramIcon, MessageCircle, FileCheck } from "lucide-react";
import { useLeadsEnriquecidos } from "@/hooks/useLeadsEnriquecidos";
import { LeadsEnriquecidosTable } from "@/components/LeadsEnriquecidosTable";
import { StatsCard } from "@/components/StatsCard";

export default function Enriquecidos() {
  const { enriquecidos, isLoading } = useLeadsEnriquecidos();

  const total = enriquecidos.length;
  const completos = enriquecidos.filter((l) => l.score === 100).length;
  const altos = enriquecidos.filter((l) => l.score >= 75).length;
  const comCnpj = enriquecidos.filter((l) => l.channels.cnpj).length;
  const comLinkedin = enriquecidos.filter((l) => l.channels.linkedin).length;
  const comInstagram = enriquecidos.filter((l) => l.channels.instagram).length;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-lg bg-primary/20">
          <Gem className="h-6 w-6 text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Leads Enriquecidos</h1>
          <p className="text-sm text-muted-foreground">
            Visão 360° cruzando Maps + CNPJ + LinkedIn + Instagram + DadosBooster.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <StatsCard title="Total" value={total} subtitle="empresas" icon={Building2} variant="default" delay={0} />
        <StatsCard title="100%" value={completos} subtitle="completos" icon={Gem} variant="primary" delay={50} />
        <StatsCard title="≥75%" value={altos} subtitle="alta qualidade" icon={MessageCircle} variant="accent" delay={100} />
        <StatsCard title="Com CNPJ" value={comCnpj} subtitle="validados" icon={FileCheck} variant="warning" delay={150} />
        <StatsCard title="LinkedIn" value={comLinkedin} subtitle="com perfil" icon={LinkedinIcon} variant="primary" delay={200} />
        <StatsCard title="Instagram" value={comInstagram} subtitle="com perfil" icon={InstagramIcon} variant="accent" delay={250} />
      </div>

      <LeadsEnriquecidosTable leads={enriquecidos} isLoading={isLoading} />
    </div>
  );
}