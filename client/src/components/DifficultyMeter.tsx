import { cn } from "@/lib/utils";

type Difficulty = 'easy' | 'moderate' | 'hard' | 'expert';

interface DifficultyMeterProps {
  difficulty: Difficulty;
  className?: string;
  showLabel?: boolean;
}

const config = {
  easy: { level: 1, color: "bg-emerald-500", label: "Easy" },
  moderate: { level: 2, color: "bg-amber-500", label: "Moderate" },
  hard: { level: 3, color: "bg-rose-500", label: "Hard" },
  expert: { level: 4, color: "bg-indigo-600", label: "Expert" },
};

export function DifficultyMeter({ difficulty, className, showLabel = false }: DifficultyMeterProps) {
  const current = config[difficulty] || config.easy;

  return (
    <div className={cn("flex items-center gap-2", className)}>
      <div className="flex gap-1">
        {[1, 2, 3, 4].map((step) => (
          <div
            key={step}
            className={cn(
              "h-1.5 w-4 rounded-full transition-all",
              step <= current.level ? current.color : "bg-muted"
            )}
          />
        ))}
      </div>
      {showLabel && (
        <span className={cn("text-xs font-semibold uppercase tracking-wider", `text-${current.color.replace('bg-', '')}`)}>
          {current.label}
        </span>
      )}
    </div>
  );
}
