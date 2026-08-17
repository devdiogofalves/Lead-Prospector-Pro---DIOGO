import { useEffect, useState } from "react";
import { useNavigate, useLocation, Link } from "react-router-dom";
import { z } from "zod";
import { Loader2, Mail, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "@/hooks/use-toast";
import logo from "@/assets/logo.png";
import MatrixRain from "@/components/MatrixRain";

const emailSchema = z.string().trim().email({ message: "E-mail inválido" }).max(255);
const passwordSchema = z.string().min(6, { message: "Mínimo 6 caracteres" }).max(100);

function safeNext(raw: string | null): string | null {
  if (!raw) return null;
  // Only allow same-origin relative paths that start with a single '/'.
  if (!raw.startsWith("/") || raw.startsWith("//")) return null;
  return raw;
}

export default function Auth() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const nextParam = safeNext(new URLSearchParams(location.search).get("next"));
  const from =
    nextParam ??
    (location.state as { from?: { pathname: string } } | null)?.from?.pathname ??
    "/";

  const [busy, setBusy] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  useEffect(() => {
    if (!loading && user) navigate(from, { replace: true });
  }, [user, loading, from, navigate]);

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    const emailCheck = emailSchema.safeParse(email);
    const passCheck = passwordSchema.safeParse(password);
    if (!emailCheck.success) return toast({ title: "E-mail inválido", description: emailCheck.error.issues[0].message, variant: "destructive" });
    if (!passCheck.success) return toast({ title: "Senha inválida", description: passCheck.error.issues[0].message, variant: "destructive" });

    setBusy(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setBusy(false);
    if (error) {
      toast({ title: "Erro ao entrar", description: error.message, variant: "destructive" });
      return;
    }
    navigate(from, { replace: true });
  };

  return (
    <div className="min-h-screen relative flex items-center justify-center bg-background px-4 overflow-hidden">
      <MatrixRain opacity={0.45} />
      {/* Vignette + scanlines */}
      <div className="pointer-events-none fixed inset-0 z-0 bg-[radial-gradient(ellipse_at_center,transparent_0%,hsl(160_15%_3%/.85)_80%)]" />
      <div
        className="pointer-events-none fixed inset-0 z-0 opacity-[0.08] mix-blend-overlay"
        style={{
          backgroundImage:
            "repeating-linear-gradient(0deg, hsl(142 100% 50% / 0.4) 0px, hsl(142 100% 50% / 0.4) 1px, transparent 1px, transparent 3px)",
        }}
      />

      <Card className="w-full max-w-md relative z-10 border-primary/30 bg-card/80 backdrop-blur-md neon-border">
        <CardHeader className="text-center space-y-3 pb-2">
          <img
            src={logo}
            alt="LeadsBooster"
            className="mx-auto h-36 w-auto object-contain animate-pulse-soft drop-shadow-[0_0_35px_hsl(142_100%_50%/0.75)]"
          />
          <CardDescription className="font-mono text-[11px] uppercase tracking-[0.3em] text-primary/80">
            &gt; Acesse seu painel de prospecção
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSignIn} className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="signin-email" className="font-mono text-xs uppercase tracking-wider text-primary/80">E-mail</Label>
              <div className="relative">
                <Mail className="absolute left-3 top-3 h-4 w-4 text-primary/70" />
                <Input id="signin-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="pl-9 font-mono bg-background/60 border-primary/30 focus-visible:ring-primary" required />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="signin-pass" className="font-mono text-xs uppercase tracking-wider text-primary/80">Senha</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-3 h-4 w-4 text-primary/70" />
                <Input id="signin-pass" type="password" value={password} onChange={(e) => setPassword(e.target.value)} className="pl-9 font-mono bg-background/60 border-primary/30 focus-visible:ring-primary" required />
              </div>
            </div>
            <Button type="submit" className="w-full font-mono uppercase tracking-widest neon-border" disabled={busy}>
              {busy && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
              Entrar
            </Button>
            <Link to="/forgot-password" className="block text-xs text-center font-mono text-muted-foreground hover:text-primary transition-colors">
              Esqueci minha senha
            </Link>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
