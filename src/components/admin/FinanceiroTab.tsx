import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "@/hooks/use-toast";
import { DollarSign, TrendingUp, TrendingDown, Plus, Trash2, Loader2, Wallet } from "lucide-react";

interface FinanceiroTabProps {
  mrr: number;
}

const CATEGORIAS = [
  "Infraestrutura", "APIs / Integrações", "Marketing", "Equipe / Salários",
  "Comissões", "Software / SaaS", "Impostos", "Outros",
];

export function FinanceiroTab({ mrr }: FinanceiroTabProps) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    descricao: "", categoria: "Infraestrutura", valor: "",
    recorrente: true, data: new Date().toISOString().slice(0, 10), notas: "",
  });

  const { data: expenses = [], isLoading } = useQuery({
    queryKey: ["admin_expenses"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("admin_expenses")
        .select("*")
        .order("data", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const recorrentes = expenses.filter((e: any) => e.recorrente);
  const totalMensal = recorrentes.reduce((s: number, e: any) => s + Number(e.valor || 0), 0);

  const mesAtual = new Date().toISOString().slice(0, 7);
  const unicasMes = expenses.filter((e: any) => !e.recorrente && (e.data ?? "").startsWith(mesAtual));
  const totalUnicasMes = unicasMes.reduce((s: number, e: any) => s + Number(e.valor || 0), 0);

  const totalDespesasMes = totalMensal + totalUnicasMes;
  const lucroMes = mrr - totalDespesasMes;
  const margem = mrr > 0 ? ((lucroMes / mrr) * 100) : 0;

  async function save() {
    if (!form.descricao || !form.valor) {
      toast({ title: "Preencha descrição e valor", variant: "destructive" });
      return;
    }
    setSaving(true);
    const { error } = await supabase.from("admin_expenses").insert({
      descricao: form.descricao,
      categoria: form.categoria,
      valor: Number(form.valor),
      recorrente: form.recorrente,
      data: form.data,
      notas: form.notas || null,
    });
    setSaving(false);
    if (error) {
      toast({ title: "Erro ao salvar", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Despesa cadastrada" });
    setForm({ descricao: "", categoria: "Infraestrutura", valor: "", recorrente: true, data: new Date().toISOString().slice(0, 10), notas: "" });
    setOpen(false);
    qc.invalidateQueries({ queryKey: ["admin_expenses"] });
  }

  async function remove(id: string) {
    if (!confirm("Remover esta despesa?")) return;
    const { error } = await supabase.from("admin_expenses").delete().eq("id", id);
    if (error) { toast({ title: "Erro", description: error.message, variant: "destructive" }); return; }
    toast({ title: "Removida" });
    qc.invalidateQueries({ queryKey: ["admin_expenses"] });
  }

  return (
    <div className="space-y-4 mt-3">
      {/* KPIs */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="border-emerald-500/30 bg-emerald-500/5">
          <CardContent className="pt-5">
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground flex items-center gap-1.5"><TrendingUp className="h-3.5 w-3.5 text-emerald-400" /> Receita (MRR)</span>
              <DollarSign className="h-4 w-4 text-emerald-400" />
            </div>
            <div className="text-2xl font-bold text-emerald-400 mt-2">R$ {mrr.toLocaleString("pt-BR")}</div>
            <div className="text-[11px] text-muted-foreground mt-0.5">recorrente / mês</div>
          </CardContent>
        </Card>

        <Card className="border-red-500/30 bg-red-500/5">
          <CardContent className="pt-5">
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground flex items-center gap-1.5"><TrendingDown className="h-3.5 w-3.5 text-red-400" /> Despesas do mês</span>
              <Wallet className="h-4 w-4 text-red-400" />
            </div>
            <div className="text-2xl font-bold text-red-400 mt-2">R$ {totalDespesasMes.toLocaleString("pt-BR")}</div>
            <div className="text-[11px] text-muted-foreground mt-0.5">
              R$ {totalMensal.toLocaleString("pt-BR")} fixas + R$ {totalUnicasMes.toLocaleString("pt-BR")} avulsas
            </div>
          </CardContent>
        </Card>

        <Card className={lucroMes >= 0 ? "border-primary/30 bg-primary/5" : "border-amber-500/30 bg-amber-500/5"}>
          <CardContent className="pt-5">
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">Lucro líquido</span>
              <DollarSign className={`h-4 w-4 ${lucroMes >= 0 ? "text-primary" : "text-amber-400"}`} />
            </div>
            <div className={`text-2xl font-bold mt-2 ${lucroMes >= 0 ? "text-primary" : "text-amber-400"}`}>
              R$ {lucroMes.toLocaleString("pt-BR")}
            </div>
            <div className="text-[11px] text-muted-foreground mt-0.5">receita − despesas</div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-5">
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">Margem</span>
            </div>
            <div className="text-2xl font-bold mt-2">{margem.toFixed(1)}%</div>
            <div className="text-[11px] text-muted-foreground mt-0.5">
              {recorrentes.length} despesa(s) fixa(s)
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Lista de despesas */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle className="text-base">Despesas cadastradas</CardTitle>
          <Button size="sm" onClick={() => setOpen(true)}>
            <Plus className="h-4 w-4 mr-1.5" /> Nova despesa
          </Button>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
          ) : expenses.length === 0 ? (
            <div className="text-center text-sm text-muted-foreground py-8">
              Nenhuma despesa cadastrada ainda. Clique em "Nova despesa" para começar.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Descrição</TableHead>
                  <TableHead>Categoria</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Data</TableHead>
                  <TableHead className="text-right">Valor</TableHead>
                  <TableHead className="w-10"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {expenses.map((e: any) => (
                  <TableRow key={e.id}>
                    <TableCell className="font-medium">
                      {e.descricao}
                      {e.notas && <div className="text-[11px] text-muted-foreground">{e.notas}</div>}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">{e.categoria ?? "—"}</TableCell>
                    <TableCell>
                      <span className={`text-[10px] px-2 py-0.5 rounded-md ${e.recorrente ? "bg-blue-500/15 text-blue-400" : "bg-muted text-muted-foreground"}`}>
                        {e.recorrente ? "Mensal" : "Única"}
                      </span>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">{e.data}</TableCell>
                    <TableCell className="text-right font-mono text-red-400">
                      R$ {Number(e.valor).toLocaleString("pt-BR")}
                    </TableCell>
                    <TableCell>
                      <Button size="icon" variant="ghost" onClick={() => remove(e.id)}>
                        <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Modal nova despesa */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nova despesa</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Descrição</Label>
              <Input value={form.descricao} onChange={(e) => setForm({ ...form, descricao: e.target.value })} placeholder="Ex: Servidor Hetzner" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Categoria</Label>
                <Select value={form.categoria} onValueChange={(v) => setForm({ ...form, categoria: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {CATEGORIAS.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Valor (R$)</Label>
                <Input type="number" step="0.01" value={form.valor} onChange={(e) => setForm({ ...form, valor: e.target.value })} placeholder="0.00" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Data</Label>
                <Input type="date" value={form.data} onChange={(e) => setForm({ ...form, data: e.target.value })} />
              </div>
              <div className="flex items-center justify-between pt-6">
                <Label className="text-sm">Recorrente (mensal)</Label>
                <Switch checked={form.recorrente} onCheckedChange={(v) => setForm({ ...form, recorrente: v })} />
              </div>
            </div>
            <div>
              <Label>Notas (opcional)</Label>
              <Input value={form.notas} onChange={(e) => setForm({ ...form, notas: e.target.value })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button onClick={save} disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />} Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
