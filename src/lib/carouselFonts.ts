// 20 fontes curadas para o motor de carrossel.
// A chave `family` é EXATAMENTE o nome usado pelo Canvas/CSS (case-sensitive).

export type CarouselFont = {
  id: string;
  family: string;
  category: "sans" | "serif" | "display" | "script" | "mono" | "humanist";
  label: string;
  weights: number[];
};

export const CAROUSEL_FONTS: CarouselFont[] = [
  // Sans modernas
  { id: "inter", family: "Inter", category: "sans", label: "Inter — neutra tech", weights: [400, 700, 900] },
  { id: "poppins", family: "Poppins", category: "sans", label: "Poppins — amigável", weights: [400, 700, 900] },
  { id: "montserrat", family: "Montserrat", category: "sans", label: "Montserrat — versátil", weights: [400, 700, 900] },
  { id: "dm-sans", family: "DM Sans", category: "sans", label: "DM Sans — editorial", weights: [400, 700] },
  { id: "space-grotesk", family: "Space Grotesk", category: "sans", label: "Space Grotesk — geométrica", weights: [400, 700] },
  { id: "figtree", family: "Figtree", category: "sans", label: "Figtree — SaaS", weights: [400, 700, 900] },
  { id: "outfit", family: "Outfit", category: "sans", label: "Outfit — moderna", weights: [400, 700, 900] },
  // Serif elegantes
  { id: "playfair", family: "Playfair Display", category: "serif", label: "Playfair — luxo", weights: [400, 700, 900] },
  { id: "dm-serif", family: "DM Serif Display", category: "serif", label: "DM Serif — chamada", weights: [400] },
  { id: "fraunces", family: "Fraunces", category: "serif", label: "Fraunces — expressiva", weights: [400, 700, 900] },
  { id: "cormorant", family: "Cormorant Garamond", category: "serif", label: "Cormorant — clássica", weights: [400, 700] },
  // Display impacto
  { id: "bebas", family: "Bebas Neue", category: "display", label: "Bebas Neue — pôster", weights: [400] },
  { id: "anton", family: "Anton", category: "display", label: "Anton — impacto", weights: [400] },
  { id: "archivo-black", family: "Archivo Black", category: "display", label: "Archivo Black — bold", weights: [400] },
  { id: "oswald", family: "Oswald", category: "display", label: "Oswald — condensada", weights: [400, 700] },
  // Script
  { id: "caveat", family: "Caveat", category: "script", label: "Caveat — manuscrita", weights: [400, 700] },
  { id: "dancing", family: "Dancing Script", category: "script", label: "Dancing Script — elegante", weights: [400, 700] },
  // Mono
  { id: "jetbrains", family: "JetBrains Mono", category: "mono", label: "JetBrains Mono — código", weights: [400, 700] },
  { id: "space-mono", family: "Space Mono", category: "mono", label: "Space Mono — retrô tech", weights: [400, 700] },
  // Humanistas
  { id: "lora", family: "Lora", category: "humanist", label: "Lora — leitura", weights: [400, 700] },
  { id: "nunito", family: "Nunito", category: "humanist", label: "Nunito — acolhedora", weights: [400, 700, 900] },
];

// Pares recomendados (heading + body) — pra sugestão automática por brand
export const FONT_PAIRS: { name: string; heading: string; body: string; mood: string }[] = [
  { name: "Editorial Luxo", heading: "Playfair Display", body: "Inter", mood: "premium" },
  { name: "SaaS Moderno", heading: "Space Grotesk", body: "Inter", mood: "tech" },
  { name: "Bold Impact", heading: "Anton", body: "Inter", mood: "energético" },
  { name: "Minimalista Clean", heading: "DM Serif Display", body: "DM Sans", mood: "elegante" },
  { name: "Startup Amigável", heading: "Outfit", body: "Nunito", mood: "casual" },
  { name: "Retrô Tech", heading: "Space Mono", body: "Inter", mood: "geek" },
  { name: "Manuscrito Warm", heading: "Caveat", body: "Lora", mood: "artesanal" },
  { name: "Pôster Vintage", heading: "Bebas Neue", body: "Lora", mood: "vintage" },
];

export function getFontById(id: string): CarouselFont | undefined {
  return CAROUSEL_FONTS.find((f) => f.id === id);
}
export function getFontByFamily(family: string): CarouselFont | undefined {
  return CAROUSEL_FONTS.find((f) => f.family.toLowerCase() === family.toLowerCase());
}
