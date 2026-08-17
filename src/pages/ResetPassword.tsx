import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Loader2, MapPin } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

export default function ResetPassword() {
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    // Verifica se chegou via link de recovery
    if (window.location.hash.includes("type=recovery")) {
      setReady(true);
    } else {
      // Sem token de recovery, manda pra auth
      const timer = setTimeout(() => navigate("/auth"), 300);
      return () => clearTimeout(timer);
    }
  }, [navigate]);

  const handle = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 6) {
      toast({ title: "Senha muito curta", description: "Mínimo 6 caracteres", variant: "destructive" });
      return;
    }
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (error) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Senha atualizada!", description: "Você já pode usar a nova senha." });
    navigate("/");
  };

  if (!ready) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <Card className="w-full max-w-md glass">
        <CardHeader className="text-center space-y-2">
          <div className="mx-auto p-3 rounded-xl bg-primary/20 w-fit">
            <MapPin className="h-6 w-6 text-primary" />
          </div>
          <CardTitle>Definir nova senha</CardTitle>
          <CardDescription>Escolha uma senha forte</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handle} className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="pw">Nova senha</Label>
              <Input id="pw" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
            </div>
            <Button type="submit" className="w-full" disabled={busy}>
              {busy && <Loader2 className="h-4 w-4 animate-spin" />}
              Salvar
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
