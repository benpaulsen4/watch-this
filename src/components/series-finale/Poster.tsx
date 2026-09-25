import { Play } from "lucide-react";
import Image from "next/image";

import { getImageUrl } from "@/lib/tmdb/client";
import { cn } from "@/lib/utils";

/**
 * "default" fills the recap's panel column (1e); "large" is the story's
 * 190px poster with its drop shadow (1c).
 */
const SIZES = {
  default: {
    frame: "rounded-[10px] bg-gray-800",
    placeholder: "rounded-[10px] border-gray-600",
    icon: "h-5 w-5 text-gray-500",
    sizes: "(min-width: 1024px) 14rem, 45vw",
  },
  large: {
    frame:
      "w-[190px] rounded-xl bg-white/5 shadow-[0_24px_48px_-12px_rgba(0,0,0,0.7)]",
    placeholder: "rounded-xl border-white/30",
    icon: "h-6 w-6 text-white/40",
    sizes: "190px",
  },
} as const;

/**
 * A TMDB poster, or a quiet placeholder where the title has none.
 *
 * Decorative: every use sits beside the title in text, so the image has an
 * empty alt rather than making a screen reader read the title twice. A use
 * without a visible title would need to name it.
 */
export function Poster({
  posterPath,
  size = "default",
}: {
  posterPath: string | null;
  size?: keyof typeof SIZES;
}) {
  const styles = SIZES[size];
  const src = getImageUrl(posterPath, "w342");

  return (
    <div className={cn("relative aspect-[2/3] overflow-hidden", styles.frame)}>
      {src ? (
        <Image
          src={src}
          alt=""
          fill
          sizes={styles.sizes}
          className="object-cover"
        />
      ) : (
        <div
          aria-hidden="true"
          className={cn(
            "flex h-full items-center justify-center border border-dashed",
            styles.placeholder,
          )}
        >
          <Play className={styles.icon} />
        </div>
      )}
    </div>
  );
}
