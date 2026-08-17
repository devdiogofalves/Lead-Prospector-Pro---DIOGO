// Renderiza slides em <canvas> (client-side) sobrepondo texto com fontes
// escolhidas sobre a imagem de fundo gerada pela IA. Exporta cada slide como PNG.

import { useEffect, useRef } from "react";

export type Slide = {
  heading: string;
  body: string;
  background_url?: string;
};

export type CarouselStyle = {
  headingFont: string;
  bodyFont: string;
  headingColor: string;
  bodyColor: string;
  overlayColor: string; // rgba
  logoUrl?: string;
  template: string;
};

const W = 1080;
const H = 1350;

function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let current = "";
  for (const w of words) {
    const test = current ? current + " " + w : w;
    if (ctx.measureText(test).width > maxWidth && current) {
      lines.push(current);
      current = w;
    } else {
      current = test;
    }
  }
  if (current) lines.push(current);
  return lines;
}

async function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

export async function renderSlide(
  canvas: HTMLCanvasElement,
  slide: Slide,
  style: CarouselStyle,
  index: number,
  total: number,
) {
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d")!;

  // fundo
  if (slide.background_url) {
    const img = await loadImage(slide.background_url);
    if (img) {
      // cover fit
      const ratio = Math.max(W / img.width, H / img.height);
      const iw = img.width * ratio;
      const ih = img.height * ratio;
      ctx.drawImage(img, (W - iw) / 2, (H - ih) / 2, iw, ih);
    } else {
      ctx.fillStyle = style.overlayColor.replace(/[\d.]+\)$/, "1)");
      ctx.fillRect(0, 0, W, H);
    }
  } else {
    // gradiente fallback
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, style.headingColor);
    g.addColorStop(1, style.bodyColor);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  }

  // overlay escuro pra legibilidade
  ctx.fillStyle = style.overlayColor;
  ctx.fillRect(0, 0, W, H);

  // margens
  const pad = 90;
  const maxWidth = W - pad * 2;

  // heading
  const headingSize = index === 0 ? 92 : 76;
  ctx.fillStyle = style.headingColor;
  ctx.font = `900 ${headingSize}px "${style.headingFont}", sans-serif`;
  ctx.textBaseline = "top";
  const headingLines = wrapText(ctx, slide.heading, maxWidth);
  const headingLineH = headingSize * 1.1;
  const headingBlockH = headingLines.length * headingLineH;

  // body
  ctx.font = `400 34px "${style.bodyFont}", sans-serif`;
  const bodyLines = wrapText(ctx, slide.body, maxWidth);
  const bodyLineH = 46;
  const bodyBlockH = bodyLines.length * bodyLineH;

  const totalBlock = headingBlockH + 40 + bodyBlockH;
  let y = (H - totalBlock) / 2;

  // heading render
  ctx.fillStyle = style.headingColor;
  ctx.font = `900 ${headingSize}px "${style.headingFont}", sans-serif`;
  for (const line of headingLines) {
    ctx.fillText(line, pad, y);
    y += headingLineH;
  }

  y += 40;

  // body render
  ctx.fillStyle = style.bodyColor;
  ctx.font = `400 34px "${style.bodyFont}", sans-serif`;
  for (const line of bodyLines) {
    ctx.fillText(line, pad, y);
    y += bodyLineH;
  }

  // dots indicador
  const dotY = H - 80;
  const dotSize = 10;
  const gap = 18;
  const totalW = total * dotSize + (total - 1) * gap;
  let dotX = (W - totalW) / 2;
  for (let i = 0; i < total; i++) {
    ctx.beginPath();
    ctx.arc(dotX + dotSize / 2, dotY, dotSize / 2, 0, Math.PI * 2);
    ctx.fillStyle = i === index ? style.headingColor : style.headingColor + "55";
    ctx.fill();
    dotX += dotSize + gap;
  }

  // logo canto inferior direito
  if (style.logoUrl) {
    const logo = await loadImage(style.logoUrl);
    if (logo) {
      const lsize = 72;
      ctx.save();
      ctx.beginPath();
      ctx.arc(W - pad - lsize / 2, H - pad - lsize / 2, lsize / 2, 0, Math.PI * 2);
      ctx.closePath();
      ctx.clip();
      ctx.drawImage(logo, W - pad - lsize, H - pad - lsize, lsize, lsize);
      ctx.restore();
    }
  }
}

export function SlidePreview({
  slide,
  style,
  index,
  total,
  className,
}: {
  slide: Slide;
  style: CarouselStyle;
  index: number;
  total: number;
  className?: string;
}) {
  const ref = useRef<HTMLCanvasElement | null>(null);
  useEffect(() => {
    if (!ref.current) return;
    // aguarda fontes carregarem
    (document as any).fonts?.ready?.then?.(() => {
      if (ref.current) renderSlide(ref.current, slide, style, index, total);
    }) ?? renderSlide(ref.current, slide, style, index, total);
  }, [slide.heading, slide.body, slide.background_url, style.headingFont, style.bodyFont, style.headingColor, style.bodyColor, style.overlayColor, style.logoUrl, index, total]);

  return (
    <canvas
      ref={ref}
      className={className ?? "w-full aspect-[4/5] rounded-lg border border-border bg-muted"}
    />
  );
}

export async function exportSlideBlob(slide: Slide, style: CarouselStyle, index: number, total: number): Promise<Blob> {
  const canvas = document.createElement("canvas");
  await renderSlide(canvas, slide, style, index, total);
  return await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("toBlob failed"))), "image/png", 0.95);
  });
}
