import { useState } from "react";
import { Link } from "react-router-dom";
import { z } from "zod";
import { Loader2, MapPin, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

const emailSchema = z.string().trim().email().max(255);

export default function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  const handle = async (e: React.FormEvent) => {
    e.preventDefault();
    const check = emailSchema.safeParse(email);
    if (!check.success) return toast({ title: "E-mail inválido", variant: "destructive" });
    setBusy(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    setBusy(false);
    if (error) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
      return;
    }
    setSent(true);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <Card className="w-full max-w-md glass">
        <CardHeader className="text-center space-y-2">
          <div className="mx-auto p-3 rounded-xl bg-primary/20 w-fit">
            <MapPin className="h-6 w-6 text-primary" />
          </div>
          <CardTitle>Recuperar senha</CardTitle>
          <CardDescription>Te enviamos um link para redefinir a senha</CardDescription>
        </CardHeader>
        <CardContent>
          {sent ? (
            <div className="space-y-4 text-center">
              <p className="text-sm text-muted-foreground">
                Se houver uma conta com esse e-mail, enviamos um link de recuperação.
              </p>
              <Link to="/auth" className="text-sm text-primary hover:underline inline-flex items-center gap-1">
                <ArrowLeft className="h-3 w-3" /> Voltar ao login
              </Link>
            </div>
          ) : (
            <form onSubmit={handle} className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="email">E-mail</Label>
                <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
              </div>
              <Button type="submit" className="w-full" disabled={busy}>
                {busy && <Loader2 className="h-4 w-4 animate-spin" />}
                Enviar link
              </Button>
              <Link to="/auth" className="block text-xs text-center text-muted-foreground hover:text-primary">
                Voltar ao login
              </Link>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
