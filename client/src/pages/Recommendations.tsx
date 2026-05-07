import { useState } from "react";
import { Layout } from "@/components/Layout";
import { HeroMediaSection } from "@/components/HeroMediaSection";
import { TrailCard } from "@/components/TrailCard";
import {
  useGetRecommendations,
  useUpdateUserPreferences,
  useGetUserPreferences,
} from "@workspace/api-client-react";
import { useAuth } from "@/hooks/useAuth";
import { Sparkles, Settings2, Loader2, Compass } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

const HERO_IMAGE = `${import.meta.env.BASE_URL}images/landing.webp`;

export function Recommendations() {
  const { user } = useAuth();
  const [isSettingPrefs, setIsSettingPrefs] = useState(false);
  const queryClient = useQueryClient();

  const userId = user?.id ?? "";

  const { data, isLoading, refetch } = useGetRecommendations(
    { userId: userId || undefined, limit: 6 },
    { query: { enabled: true } }
  );

  const { data: prefs } = useGetUserPreferences(userId, {
    query: { enabled: !!userId },
  });
  const updatePrefs = useUpdateUserPreferences();

  const handleUpdatePrefs = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!userId) return;
    const formData = new FormData(e.currentTarget);
    updatePrefs.mutate(
      {
        userId,
        data: {
          preferredDifficulty: (formData.get("difficulty") as string) || undefined,
          preferredTerrain: (formData.get("terrain") as string) || undefined,
          preferredMaxLengthKm: formData.get("length")
            ? parseInt(formData.get("length") as string, 10)
            : undefined,
        },
      },
      {
        onSuccess: () => {
          setIsSettingPrefs(false);
          queryClient.invalidateQueries({ queryKey: ["/api/users"] });
          refetch();
        },
      }
    );
  };

  const inputClass =
    "w-full rounded-xl border border-border/80 bg-white/90 px-4 py-2.5 text-sm text-foreground shadow-sm outline-none transition-all placeholder:text-muted-foreground/70 focus:border-primary/40 focus:ring-2 focus:ring-primary/15 dark:bg-card/80";

  return (
    <Layout>
      <HeroMediaSection
        imageSrc={HERO_IMAGE}
        imageAlt=""
        minHeightClass="min-h-[32vh] lg:min-h-[38vh] pb-14 lg:pb-16"
      >
        <div className="relative z-10 mx-auto max-w-2xl px-4 pt-28 pb-4 text-center sm:pt-32">
          <div className="mb-5 inline-flex h-14 w-14 items-center justify-center rounded-2xl border border-white/20 bg-white/10 text-white shadow-lg backdrop-blur-md">
            <Sparkles className="h-7 w-7" strokeWidth={1.5} />
          </div>
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.28em] text-white/75">
            Personalised
          </p>
          <h1 className="font-display text-4xl font-bold tracking-tight text-white drop-shadow-[0_2px_16px_rgba(0,0,0,0.45)] sm:text-5xl">
            Recommendations
          </h1>
          <p className="mx-auto mt-4 max-w-md text-sm leading-relaxed text-white/90 drop-shadow-sm sm:text-base">
            {user?.firstName
              ? `Suggested routes for ${user.firstName}, from your settings and hike history.`
              : "Suggested routes from your settings and hike history when you are signed in."}
          </p>
        </div>
      </HeroMediaSection>

      <div className="relative z-20 -mt-16 pb-24 lg:-mt-20">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
          <div
            className={cn(
              "rounded-[1.75rem] border border-border/50 bg-background/80 p-6 shadow-[0_24px_80px_-12px_rgba(0,0,0,0.12)] backdrop-blur-2xl",
              "dark:border-border/40 dark:bg-background/75 dark:shadow-black/30",
              "md:p-9 lg:p-10"
            )}
          >
            <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="font-display text-lg font-semibold text-foreground md:text-xl">
                  Your picks
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Adjust preferences anytime — the list updates after you save.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsSettingPrefs(!isSettingPrefs)}
                className={cn(
                  "inline-flex items-center justify-center gap-2 self-start rounded-full border px-5 py-2.5 text-sm font-semibold transition-all",
                  isSettingPrefs
                    ? "border-border bg-muted/60 text-foreground hover:bg-muted"
                    : "border-primary/25 bg-primary/10 text-primary hover:bg-primary/15"
                )}
              >
                <Settings2 className="h-4 w-4" />
                {isSettingPrefs ? "Close" : "Preferences"}
              </button>
            </div>

            {isSettingPrefs && (
              <motion.div
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                className="mb-10 rounded-2xl border border-border/60 bg-muted/20 p-6 dark:bg-muted/10"
              >
                <h3 className="mb-5 font-display text-base font-semibold text-foreground">
                  Hiking preferences
                </h3>
                <form onSubmit={handleUpdatePrefs} className="grid gap-6 sm:grid-cols-3">
                  <div className="space-y-2">
                    <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Max distance (km)
                    </label>
                    <input
                      name="length"
                      type="number"
                      min={1}
                      defaultValue={prefs?.preferredMaxLengthKm ?? ""}
                      placeholder="e.g. 15"
                      className={inputClass}
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Difficulty
                    </label>
                    <select
                      name="difficulty"
                      defaultValue={prefs?.preferredDifficulty ?? ""}
                      className={inputClass}
                    >
                      <option value="">Any</option>
                      <option value="easy">Easy</option>
                      <option value="moderate">Moderate</option>
                      <option value="hard">Hard</option>
                      <option value="expert">Expert</option>
                    </select>
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Terrain
                    </label>
                    <select
                      name="terrain"
                      defaultValue={prefs?.preferredTerrain ?? ""}
                      className={inputClass}
                    >
                      <option value="">Any</option>
                      <option value="mountain">Mountain</option>
                      <option value="coastal">Coastal</option>
                      <option value="woodland">Woodland</option>
                      <option value="moorland">Moorland</option>
                    </select>
                  </div>
                  <div className="flex justify-end sm:col-span-3">
                    <button
                      type="submit"
                      disabled={updatePrefs.isPending}
                      className="inline-flex items-center gap-2 rounded-xl bg-primary px-8 py-2.5 text-sm font-semibold text-primary-foreground shadow-md transition-all hover:bg-primary/90 disabled:opacity-60"
                    >
                      {updatePrefs.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                      Save preferences
                    </button>
                  </div>
                </form>
              </motion.div>
            )}

            {isLoading ? (
              <div className="flex min-h-[280px] flex-col items-center justify-center gap-4 rounded-2xl border border-dashed border-border/70 bg-muted/10 py-16">
                <Loader2 className="h-10 w-10 animate-spin text-primary" />
                <p className="text-sm text-muted-foreground">Finding trails…</p>
              </div>
            ) : !data || data.recommendations.length === 0 ? (
              <div className="flex flex-col items-center rounded-2xl border border-border/50 bg-muted/15 px-6 py-16 text-center dark:bg-muted/5">
                <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-primary/10 text-primary">
                  <Compass className="h-8 w-8 opacity-80" />
                </div>
                <h3 className="font-display text-xl font-semibold text-foreground">No suggestions yet</h3>
                <p className="mt-2 max-w-sm text-sm leading-relaxed text-muted-foreground">
                  Log a completed hike or set preferences above, then open this page again.
                </p>
              </div>
            ) : (
              <div>
                <div className="mb-8 grid grid-cols-1 gap-6 sm:grid-cols-2 xl:grid-cols-3">
                  {data.recommendations.map((rec, i) => (
                    <motion.div
                      key={rec.trail.id}
                      initial={{ opacity: 0, y: 16 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: i * 0.06, duration: 0.35 }}
                    >
                      <TrailCard trail={rec.trail} reason={rec.reason} reasonStyle="gradient" />
                    </motion.div>
                  ))}
                </div>
                <p className="border-t border-border/50 pt-6 text-center text-xs text-muted-foreground">
                  Order reflects your preferences, hike history, and trail popularity.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </Layout>
  );
}
