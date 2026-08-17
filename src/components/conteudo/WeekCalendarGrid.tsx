import { Fragment, useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "@/hooks/use-toast";
import { ChevronLeft, ChevronRight, Image as ImageIcon, Video, Calendar } from "lucide-react";

type Post = {
  id: string;
  post_format: string | null;
  media_type: string;
  caption: string;
  status: string;
  scheduled_at: string | null;
  cover_url: string | null;
  media_urls: string[];
  channel: string;
};

const HOURS = [8, 10, 12, 14, 16, 18, 20];
const DAY_MS = 24 * 60 * 60 * 1000;

function startOfWeek(d: Date) {
  const x = new Date(d);
  const dow = x.getDay(); // 0=Sun
  const diff = (dow + 6) % 7; // to Monday
  x.setDate(x.getDate() - diff);
  x.setHours(0, 0, 0, 0);
  return x;
}

function fmtDayLabel(d: Date) {
  return d.toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit", month: "2-digit" });
}

export default function WeekCalendarGrid({ posts }: { posts: Post[] }) {
  const qc = useQueryClient();
  const [anchor, setAnchor] = useState(() => startOfWeek(new Date()));
  const [dragId, setDragId] = useState<string | null>(null);

  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => new Date(anchor.getTime() + i * DAY_MS)), [anchor]);

  const scheduled = useMemo(
    () => posts.filter((p) => p.scheduled_at && (p.status === "scheduled" || p.status === "draft" || p.status === "publishing")),
    [posts]
  );

  const byCell = useMemo(() => {
    const map = new Map<string, Post[]>();
    for (const p of scheduled) {
      if (!p.scheduled_at) continue;
      const d = new Date(p.scheduled_at);
      const day = new Date(d); day.setHours(0, 0, 0, 0);
      const dayIdx = Math.floor((day.getTime() - anchor.getTime()) / DAY_MS);
      if (dayIdx < 0 || dayIdx > 6) continue;
      // snap to nearest hour bucket
      const hr = d.getHours();
      const bucket = HOURS.reduce((best, h) => Math.abs(h - hr) < Math.abs(best - hr) ? h : best, HOURS[0]);
      const key = `${dayIdx}-${bucket}`;
      const arr = map.get(key) ?? [];
      arr.push(p);
      map.set(key, arr);
    }
    return map;
  }, [scheduled, anchor]);

  async function reschedule(postId: string, dayIdx: number, hour: number) {
    const target = new Date(days[dayIdx]);
    target.setHours(hour, 0, 0, 0);
    const iso = target.toISOString();
    const { error } = await supabase.from("social_posts").update({ scheduled_at: iso }).eq("id", postId);
    if (error) {
      toast({ title: "Falha ao reagendar", description: error.message, variant: "destructive" });
      return;
    }
    qc.invalidateQueries({ queryKey: ["social_posts_with_plan"] });
    qc.invalidateQueries({ queryKey: ["social_posts"] });
    toast({ title: "Reagendado", description: target.toLocaleString("pt-BR") });
  }

  return (
    <Card className="p-3">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Calendar className="h-4 w-4 text-primary" />
          <span className="text-sm font-medium">
            Semana de {days[0].toLocaleDateString("pt-BR")} — {days[6].toLocaleDateString("pt-BR")}
          </span>
        </div>
        <div className="flex gap-1">
          <Button size="sm" variant="ghost" onClick={() => setAnchor(new Date(anchor.getTime() - 7 * DAY_MS))}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button size="sm" variant="outline" onClick={() => setAnchor(startOfWeek(new Date()))}>Hoje</Button>
          <Button size="sm" variant="ghost" onClick={() => setAnchor(new Date(anchor.getTime() + 7 * DAY_MS))}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="overflow-x-auto">
        <div className="min-w-[900px] grid" style={{ gridTemplateColumns: "60px repeat(7, minmax(0, 1fr))" }}>
          <div />
          {days.map((d, i) => (
            <div key={i} className="text-[11px] font-medium text-center py-1 border-b">
              {fmtDayLabel(d)}
            </div>
          ))}
          {HOURS.map((h) => (
            <Fragment key={`h-${h}`}>
              <div className="text-[10px] text-muted-foreground text-right pr-2 pt-2">
                {String(h).padStart(2, "0")}:00
              </div>
              {days.map((_, dayIdx) => {
                const cellPosts = byCell.get(`${dayIdx}-${h}`) ?? [];
                return (
                  <div
                    key={`${dayIdx}-${h}`}
                    onDragOver={(e) => { e.preventDefault(); }}
                    onDrop={(e) => {
                      e.preventDefault();
                      const id = dragId ?? e.dataTransfer.getData("text/plain");
                      if (id) reschedule(id, dayIdx, h);
                      setDragId(null);
                    }}
                    className="min-h-[56px] border border-dashed border-border/40 p-1 space-y-1 hover:bg-primary/5 transition-colors"
                  >
                    {cellPosts.map((p) => {
                      const Icon = p.media_type === "video" ? Video : ImageIcon;
                      const thumb = p.cover_url || p.media_urls?.[0];
                      return (
                        <div
                          key={p.id}
                          draggable
                          onDragStart={(e) => { setDragId(p.id); e.dataTransfer.setData("text/plain", p.id); }}
                          onDragEnd={() => setDragId(null)}
                          className="text-[10px] rounded border bg-card hover:border-primary cursor-grab active:cursor-grabbing p-1 flex gap-1 items-start"
                          title={p.caption}
                        >
                          {thumb ? (
                            <img src={thumb} alt="" className="w-6 h-6 rounded object-cover flex-shrink-0" />
                          ) : (
                            <div className="w-6 h-6 rounded bg-muted flex items-center justify-center flex-shrink-0">
                              <Icon className="h-3 w-3" />
                            </div>
                          )}
                          <div className="flex-1 min-w-0">
                            <Badge variant="outline" className="text-[9px] px-1 py-0 h-3">
                              {p.post_format ?? p.media_type}
                            </Badge>
                            <p className="truncate">{p.caption?.slice(0, 40) || "(sem legenda)"}</p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </Fragment>
          ))}
        </div>
      </div>
      <p className="text-[10px] text-muted-foreground mt-2">
        Arraste um post para outro dia/hora para reagendar. Horários próximos são agrupados em blocos de 2h.
      </p>
    </Card>
  );
}
