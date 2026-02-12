"use client";

import { useEffect, useRef } from "react";

import { cn } from "@/lib/utils";

export function LandingSpotlightClient({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const update = (e: PointerEvent) => {
      const rect = el.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return;
      const x = ((e.clientX - rect.left) / rect.width) * 100;
      const y = ((e.clientY - rect.top) / rect.height) * 100;
      el.style.setProperty("--spot-x", `${x.toFixed(2)}%`);
      el.style.setProperty("--spot-y", `${y.toFixed(2)}%`);
    };

    const onEnter = (e: PointerEvent) => update(e);
    const onLeave = () => {
      el.style.setProperty("--spot-x", "50%");
      el.style.setProperty("--spot-y", "35%");
    };

    el.addEventListener("pointermove", update);
    el.addEventListener("pointerenter", onEnter);
    el.addEventListener("pointerleave", onLeave);

    return () => {
      el.removeEventListener("pointermove", update);
      el.removeEventListener("pointerenter", onEnter);
      el.removeEventListener("pointerleave", onLeave);
    };
  }, []);

  return (
    <div
      ref={ref}
      className={cn("relative [--spot-x:50%] [--spot-y:35%]", className)}
    >
      {children}
    </div>
  );
}
