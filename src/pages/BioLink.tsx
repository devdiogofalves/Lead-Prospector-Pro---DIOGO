// BioLink — página pública /bio/:handle (Linktree white-label) usando o Brand Kit.
import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { ExternalLink, Instagram, BadgeCheck } from "lucide-react";

const FN_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/bio-public`;

type Brand = {
  instagram_handle: string;
  display_name?: string;
  bio?: string;
  logo_url?: string;
  links?: Array<{ url: string; source?: string; label?: string }>;
  color_palette?: Record<string, string>;
  verified?: boolean;
  followers_count?: number;
  niche?: string;
};
type Product = { id: string; name: string; description?: string; link?: string };

export default function BioLink() {
  const { handle } = useParams();
  const [data, setData] = useState<{ brand: Brand; products: Product[] } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!handle) return;
    const clean = handle.replace(/^@/, "");
    // tenta por slug; se 404, cai pra handle (compat)
    fetch(`${FN_URL}?slug=${encodeURIComponent(clean)}`)
      .then((r) => r.json())
      .then((j) => {
        if (j?.success) return setData(j);
        return fetch(`${FN_URL}?handle=${encodeURIComponent(clean)}`)
          .then((r2) => r2.json())
          .then((j2) => (j2?.success ? setData(j2) : setError(j2?.error ?? "Não encontrado")));
      })
      .catch((e) => setError(String(e?.message ?? e)));
  }, [handle]);

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-neutral-950 text-white p-6">
        <div className="text-center">
          <Instagram className="h-10 w-10 mx-auto mb-2 opacity-50" />
          <p className="text-lg">Perfil não encontrado</p>
          <p className="text-sm opacity-60 mt-1">@{handle}</p>
        </div>
      </div>
    );
  }

  if (!data) return <div className="min-h-screen bg-neutral-950" />;

  const { brand, products } = data;
  const palette = brand.color_palette ?? {};
  const primary = palette.primary ?? "#0ea5e9";
  const bg = palette.background ?? "#0a0a0a";
  const text = palette.text ?? "#ffffff";
  const accent = palette.accent ?? primary;

  const bioLinks = (brand.links ?? []).filter((l) => l.url);
  const items = [
    ...products.map((p) => ({ label: p.name, sub: p.description, url: p.link!, kind: "product" as const })),
    ...bioLinks.map((l) => ({ label: l.label ?? new URL(l.url).hostname.replace("www.", ""), sub: undefined, url: l.url, kind: "link" as const })),
  ];

  return (
    <div className="min-h-screen px-4 py-10" style={{ background: bg, color: text }}>
      <div className="max-w-md mx-auto">
        <div className="flex flex-col items-center text-center">
          {brand.logo_url && (
            <img
              src={brand.logo_url}
              alt={brand.display_name ?? brand.instagram_handle}
              referrerPolicy="no-referrer"
              className="w-28 h-28 rounded-full object-cover border-4"
              style={{ borderColor: accent }}
            />
          )}
          <h1 className="text-2xl font-bold mt-4 flex items-center gap-1">
            {brand.display_name ?? brand.instagram_handle}
            {brand.verified && <BadgeCheck className="h-5 w-5" style={{ color: accent }} />}
          </h1>
          <a
            href={`https://instagram.com/${brand.instagram_handle}`}
            target="_blank"
            rel="noreferrer"
            className="text-sm opacity-80 hover:opacity-100 flex items-center gap-1 mt-1"
          >
            <Instagram className="h-3.5 w-3.5" /> @{brand.instagram_handle}
          </a>
          {brand.bio && (
            <p className="text-sm opacity-80 mt-3 whitespace-pre-line max-w-xs">{brand.bio}</p>
          )}
        </div>

        <div className="mt-8 space-y-3">
          {items.length === 0 && (
            <div className="text-center text-sm opacity-60">Nenhum link configurado ainda.</div>
          )}
          {items.map((it, i) => (
            <a
              key={i}
              href={it.url}
              target="_blank"
              rel="noreferrer"
              className="flex items-center justify-between gap-3 px-5 py-4 rounded-2xl transition hover:scale-[1.02]"
              style={{ background: `${primary}22`, border: `1px solid ${primary}55` }}
            >
              <div className="flex-1 min-w-0">
                <div className="font-semibold truncate">{it.label}</div>
                {it.sub && <div className="text-xs opacity-70 truncate">{it.sub}</div>}
              </div>
              <ExternalLink className="h-4 w-4 shrink-0" style={{ color: accent }} />
            </a>
          ))}
        </div>

        <div className="mt-10 text-center text-[10px] opacity-40">
          powered by LeadsBooster
        </div>
      </div>
    </div>
  );
}
