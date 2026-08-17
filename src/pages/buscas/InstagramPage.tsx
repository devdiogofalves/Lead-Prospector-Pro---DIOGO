import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Loader2, Search, Hash, UserPlus, MessageSquare, Heart } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { InstagramSearch } from "@/components/InstagramSearch";
import { InstagramContactsTable } from "@/components/InstagramContactsTable";
import { useInstagramContacts } from "@/hooks/useInstagramContacts";

function SimpleExtract({
  title, description, icon: Icon, inputLabel, inputPlaceholder, edgeFn, payload,
}: {
  title: string; description: string; icon: any; inputLabel: string; inputPlaceholder: string;
  edgeFn: string; payload: (value: string, limit: number) => any;
}) {
  const [val, setVal] = useState("");
  const [limit, setLimit] = useState(50);
  const [loading, setLoading] = useState(false);
  const [last, setLast] = useState<any>(null);

  async function run() {
    if (!val.trim()) return toast({ title: "Preencha o campo", variant: "destructive" });
    setLoading(true); setLast(null);
    try {
      const { data, error } = await supabase.functions.invoke(edgeFn, { body: payload(val.trim(), limit) });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      setLast(data);
      if (data?.background) {
        toast({ title: "Extração iniciada", description: "Os perfis vão aparecer na tabela conforme forem salvos (roda em background)." });
      } else {
        toast({ title: `${data?.saved ?? data?.profiles ?? 0} leads salvos` });
      }
    } catch (e: any) {
      toast({ title: "Erro", description: String(e?.message ?? e), variant: "destructive" });
    } finally { setLoading(false); }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><Icon className="h-5 w-5 text-primary" /> {title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid md:grid-cols-[1fr_140px] gap-3">
          <div className="space-y-2">
            <Label>{inputLabel}</Label>
            <Input value={val} onChange={(e) => setVal(e.target.value)} placeholder={inputPlaceholder} disabled={loading} />
          </div>
          <div className="space-y-2">
            <Label>Limite</Label>
            <Input type="number" min={1} value={limit} onChange={(e) => setLimit(Number(e.target.value) || 50)} disabled={loading} />
          </div>
        </div>
        <Button onClick={run} disabled={loading} className="w-full">
          {loading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Search className="h-4 w-4 mr-2" />}
          Extrair
        </Button>
        {last && (
          <div className="text-xs rounded border border-emerald-500/30 bg-emerald-500/10 p-3 text-emerald-300">
            {last.background
              ? `⏳ ${last.message ?? "Rodando em background — os perfis aparecerão na tabela abaixo conforme forem salvos."}`
              : `✓ ${last.saved ?? last.profiles ?? 0} salvos${last.found ? ` · ${last.found} encontrados` : ""}${last.withPhone != null ? ` · ${last.withPhone} com telefone` : ""}`}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function InstagramPage() {
  const [filter, setFilter] = useState("");
  const { contacts, deleteContact, clearAllContacts } = useInstagramContacts();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">InstaExtractor</h1>
        <p className="text-sm text-muted-foreground">
          Listas de alta conversão a partir de perfis-alvo, hashtags e engajamento. Tudo cai em <b>instagram_contacts</b> para disparo via Instagram DM ou WhatsApp.
        </p>
      </div>

      <Tabs defaultValue="followers">
        <TabsList className="grid grid-cols-2 md:grid-cols-5 w-full">
          <TabsTrigger value="followers">📥 Seguidores</TabsTrigger>
          <TabsTrigger value="following">📋 Seguindo</TabsTrigger>
          <TabsTrigger value="commenters">🎯 Engajadores <span className="ml-1 text-[10px] opacity-60">(Apify)</span></TabsTrigger>
          <TabsTrigger value="hashtag">#️⃣ Hashtag <span className="ml-1 text-[10px] opacity-60">(Apify)</span></TabsTrigger>
          <TabsTrigger value="likers" disabled>💗 Curtidores</TabsTrigger>
        </TabsList>

        <TabsContent value="followers" className="mt-4">
          <InstagramSearch />
        </TabsContent>

        <TabsContent value="following" className="mt-4">
          <SimpleExtract
            title="Extrair quem o perfil segue"
            description="Via Unipile — sua conta Instagram conectada. Sem custo Apify."
            icon={UserPlus}
            inputLabel="Conta alvo (@)"
            inputPlaceholder="@concorrente"
            edgeFn="unipile-instagram-scrape"
            payload={(target, limit) => ({ mode: "following", target, limit })}
          />
        </TabsContent>

        <TabsContent value="commenters" className="mt-4">
          <Card className="border-yellow-500/30 bg-yellow-500/5 mb-3">
            <CardHeader className="py-3">
              <CardTitle className="text-sm text-yellow-400 flex items-center gap-2">
                ⚠️ Endpoint não disponível no Unipile
              </CardTitle>
              <CardDescription className="text-xs">
                Instagram não expõe comentaristas por API oficial. Esta busca ainda usa Apify (custo por run). Use só quando necessário.
              </CardDescription>
            </CardHeader>
          </Card>
          <SimpleExtract
            title="Engajadores — quem comentou um post"
            description="Cole a URL de uma postagem (sua ou do concorrente) e extraia quem comentou."
            icon={MessageSquare}
            inputLabel="URL do post"
            inputPlaceholder="https://www.instagram.com/p/XXXXXX/"
            edgeFn="instagram-extract"
            payload={(post_url, limit) => ({ mode: "commenters", post_url, limit })}
          />
        </TabsContent>

        <TabsContent value="hashtag" className="mt-4">
          <Card className="border-yellow-500/30 bg-yellow-500/5 mb-3">
            <CardHeader className="py-3">
              <CardTitle className="text-sm text-yellow-400 flex items-center gap-2">
                ⚠️ Endpoint não disponível no Unipile
              </CardTitle>
              <CardDescription className="text-xs">
                Instagram não expõe busca por hashtag por API oficial. Ainda usa Apify (custo por run).
              </CardDescription>
            </CardHeader>
          </Card>
          <SimpleExtract
            title="Buscar perfis por hashtag/nicho"
            description="Coleta autores das postagens recentes em uma hashtag (com bio/seguidores)."
            icon={Hash}
            inputLabel="Hashtag (sem #)"
            inputPlaceholder="marketing, vendas"
            edgeFn="instagram-hashtag-scrape"
            payload={(val, limit) => ({ hashtags: val.split(",").map((s) => s.trim()).filter(Boolean), results_limit: limit })}
          />
        </TabsContent>

        <TabsContent value="likers" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><Heart className="h-5 w-5 text-pink-500" /> Curtidores</CardTitle>
              <CardDescription>
                Instagram bloqueou a listagem pública de curtidores em 2021. Sem endpoint disponível em Unipile nem Apify.
                Use "Engajadores" (comentários) que tem o mesmo efeito prático.
              </CardDescription>
            </CardHeader>
          </Card>
        </TabsContent>
      </Tabs>

      <InstagramContactsTable
        contacts={contacts}
        filter={filter}
        onFilterChange={setFilter}
        onDelete={deleteContact}
        onClearAll={clearAllContacts}
      />
    </div>
  );
}
