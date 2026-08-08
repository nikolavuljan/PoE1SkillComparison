import { useEffect, useState } from "react";

interface Options {
  width: number;
  height: number;
  placement?: "side" | "below";
}

export function useAnchoredPopover({ width: preferredWidth, height, placement = "side" }: Options) {
  const [position, setPosition] = useState<{ left: number; top: number } | null>(null);

  useEffect(() => {
    if (!position) return;
    const close = () => setPosition(null);
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    return () => {
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
    };
  }, [position]);

  function open(target: HTMLElement) {
    const rect = target.getBoundingClientRect();
    const width = Math.min(preferredWidth, window.innerWidth - 24);
    if (placement === "below") {
      const left = Math.min(window.innerWidth - width - 12, Math.max(12, rect.left));
      const top = Math.min(window.innerHeight - height, rect.bottom + 9);
      setPosition({ left, top: Math.max(12, top) });
      return;
    }

    const right = rect.right + 9;
    const left = right + width <= window.innerWidth - 12 ? right : Math.max(12, rect.left - width - 9);
    const top = Math.min(Math.max(12, rect.top - 8), Math.max(12, window.innerHeight - height));
    setPosition({ left, top });
  }

  return { position, open, close: () => setPosition(null) };
}
