import { type ReactNode } from "react";
import { cn } from "@/lib/utils";

type HeroMediaSectionProps = {
  imageSrc: string;
  imageAlt: string;
  /** Extends the photo under the fixed header */
  underHeader?: boolean;
  minHeightClass?: string;
  children?: ReactNode;
  className?: string;
};

/**
 * Full-width hero photo. Image stays full-opacity; only a short bottom strip fades into the page below.
 */
export function HeroMediaSection({
  imageSrc,
  imageAlt,
  underHeader = true,
  minHeightClass = "min-h-[38vh] lg:min-h-[42vh]",
  children,
  className,
}: HeroMediaSectionProps) {
  return (
    <section className={cn("relative bg-background", minHeightClass, className)}>
      <div
        className={cn(
          "absolute left-0 right-0 bottom-0 z-0",
          underHeader ? "-top-24" : "top-0"
        )}
      >
        <img src={imageSrc} alt={imageAlt} className="h-full w-full object-cover" />
        {/* Tall bottom fade: multi-stop gradient for a smooth edge into the page */}
        <div
          className={cn(
            "pointer-events-none absolute inset-x-0 bottom-0 z-[1]",
            "h-[min(44vh,15rem)] sm:h-[min(50vh,19rem)] lg:h-[min(56vh,26rem)]"
          )}
          style={{
            backgroundImage: `linear-gradient(
              to top,
              hsl(var(--background)) 0%,
              hsl(var(--background) / 0.72) 14%,
              hsl(var(--background) / 0.4) 32%,
              hsl(var(--background) / 0.16) 55%,
              hsl(var(--background) / 0.04) 78%,
              transparent 100%
            )`,
          }}
          aria-hidden
        />
      </div>
      {children}
    </section>
  );
}
