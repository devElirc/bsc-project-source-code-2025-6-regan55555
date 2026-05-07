import { Link } from "wouter";
import { MapPin, Route, Mountain, Clock, Star } from "lucide-react";
import { Trail } from "@workspace/api-client-react";
import { DifficultyMeter } from "./DifficultyMeter";
import { cn, formatDistance, formatElevation, formatDuration } from "@/lib/utils";

interface TrailCardProps {
  trail: Trail;
  reason?: string;
  /** "banner" = solid primary strip; "gradient" = soft fade for editorial layouts */
  reasonStyle?: "banner" | "gradient";
}

export function TrailCard({ trail, reason, reasonStyle = "banner" }: TrailCardProps) {
  const imageUrl = trail.imageUrl || `${import.meta.env.BASE_URL}images/trail-card.jpg`;

  return (
    <Link href={`/trails/${trail.id}`} className="block group h-full">
      <div className="h-full bg-card rounded-2xl overflow-hidden border border-border shadow-md shadow-black/5 hover:shadow-xl hover:border-primary/30 transition-all duration-300 flex flex-col group-hover:-translate-y-1">
        <div className="relative h-48 overflow-hidden">
          <img
            src={imageUrl}
            alt={trail.name}
            className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
            loading="lazy"
          />
          <div className="absolute top-3 left-3 flex flex-col gap-2">
            <span className="bg-white/90 backdrop-blur-sm px-3 py-1 rounded-full text-xs font-semibold text-foreground shadow-sm">
              {trail.region}
            </span>
          </div>
          <div className="absolute top-3 right-3 bg-white/90 backdrop-blur-sm px-2 py-1 rounded-full text-xs font-bold flex items-center gap-1 shadow-sm">
            <Star className="w-3 h-3 fill-amber-400 text-amber-400" />
            <span>{trail.rating.toFixed(1)}</span>
          </div>
          {reason && (
            <div
              className={cn(
                "absolute bottom-0 left-0 right-0 px-4 text-left text-xs leading-snug backdrop-blur-md",
                reasonStyle === "gradient"
                  ? "bg-gradient-to-t from-black/80 via-black/45 to-transparent pb-2.5 pt-10 font-medium text-white"
                  : "bg-primary/90 py-2 font-medium text-primary-foreground"
              )}
            >
              <span className="line-clamp-2">{reason}</span>
            </div>
          )}
        </div>

        <div className="p-5 flex flex-col flex-grow">
          <div className="flex justify-between items-start mb-2">
            <h3 className="font-display font-bold text-lg text-foreground line-clamp-1 group-hover:text-primary transition-colors">
              {trail.name}
            </h3>
          </div>

          <div className="flex items-center text-muted-foreground text-sm mb-4">
            <MapPin className="w-3.5 h-3.5 mr-1 flex-shrink-0" />
            <span className="truncate">{trail.location}</span>
          </div>

          <div className="grid grid-cols-3 gap-y-3 gap-x-2 text-sm mt-auto">
            <div className="flex flex-col">
              <span className="text-muted-foreground text-xs">Distance</span>
              <span className="font-semibold flex items-center gap-1">
                <Route className="w-3.5 h-3.5 text-primary" />
                {formatDistance(trail.lengthKm)}
              </span>
            </div>
            <div className="flex flex-col">
              <span className="text-muted-foreground text-xs">Ascent</span>
              <span className="font-semibold flex items-center gap-1">
                <Mountain className="w-3.5 h-3.5 text-primary" />
                {formatElevation(trail.elevationGainM)}
              </span>
            </div>
            <div className="flex flex-col">
              <span className="text-muted-foreground text-xs">Time</span>
              <span className="font-semibold flex items-center gap-1">
                <Clock className="w-3.5 h-3.5 text-primary" />
                {formatDuration(trail.estimatedDurationHours)}
              </span>
            </div>
          </div>

          <div className="mt-5 pt-4 border-t border-border flex justify-between items-center">
            <DifficultyMeter difficulty={trail.difficulty} showLabel />
            <span className="text-xs text-muted-foreground capitalize">{trail.terrain}</span>
          </div>
        </div>
      </div>
    </Link>
  );
}
