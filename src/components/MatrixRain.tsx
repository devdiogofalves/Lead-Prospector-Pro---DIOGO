import { useEffect, useRef } from "react";

/**
 * Canvas-based Matrix digital rain background.
 * Fixed, full-screen, behind content (z-0). Wrap content in a relative z-10 container.
 */
export default function MatrixRain({ opacity = 0.35 }: { opacity?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let w = (canvas.width = window.innerWidth);
    let h = (canvas.height = window.innerHeight);
    const fontSize = 16;
    let columns = Math.floor(w / fontSize);
    let drops: number[] = Array(columns).fill(1);

    const chars =
      "アァイィウヴエカガキギクグケゲコサザシジスズセソタダチッツテデトナニヌネノハバヒビフプヘホマミムメモヤユヨラリルレロワヲ0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ".split(
        ""
      );

    const onResize = () => {
      w = canvas.width = window.innerWidth;
      h = canvas.height = window.innerHeight;
      columns = Math.floor(w / fontSize);
      drops = Array(columns).fill(1);
    };
    window.addEventListener("resize", onResize);

    let raf = 0;
    const draw = () => {
      ctx.fillStyle = "rgba(8, 14, 10, 0.08)";
      ctx.fillRect(0, 0, w, h);

      ctx.font = `${fontSize}px JetBrains Mono, monospace`;
      for (let i = 0; i < drops.length; i++) {
        const text = chars[Math.floor(Math.random() * chars.length)];
        const y = drops[i] * fontSize;
        // Bright leading character
        ctx.fillStyle = "rgba(180, 255, 200, 0.95)";
        ctx.fillText(text, i * fontSize, y);
        // Trail
        ctx.fillStyle = "rgba(0, 255, 90, 0.85)";
        ctx.fillText(text, i * fontSize, y - fontSize);

        if (y > h && Math.random() > 0.975) drops[i] = 0;
        drops[i]++;
      }
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", onResize);
    };
  }, []);

  return (
    <canvas
      ref={ref}
      className="fixed inset-0 pointer-events-none z-0"
      style={{ opacity }}
      aria-hidden
    />
  );
}
