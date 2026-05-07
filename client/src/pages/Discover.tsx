import { useState } from "react";
import { Layout } from "@/components/Layout";
import { HeroMediaSection } from "@/components/HeroMediaSection";
import { FilterPanel } from "@/components/FilterPanel";
import { TrailCard } from "@/components/TrailCard";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useListTrails, ListTrailsParams, type Trail } from "@workspace/api-client-react";
import { motion } from "framer-motion";
import {
  Loader2,
  Trees,
  Compass,
  ChevronLeft,
  ChevronRight,
  Sparkles,
  X,
} from "lucide-react";

const PAGE_SIZE = 20;

function keepVisibleFilters(f: ListTrailsParams): ListTrailsParams {
  return {
    search: f.search,
    difficulty: f.difficulty,
    terrain: f.terrain,
    maxLength: f.maxLength,
    region: f.region,
  };
}

function groundedTrailMatchNote(trail: Trail, f: ListTrailsParams): string {
  const bits = [
    `${trail.lengthKm.toFixed(1)} km`,
    trail.difficulty,
    trail.terrain,
  ];
  const hints: string[] = [];
  if (f.difficulty && trail.difficulty === f.difficulty) hints.push("difficulty");
  if (f.maxLength != null && trail.lengthKm <= f.maxLength + 1e-6) hints.push(`≤${f.maxLength} km`);
  if (f.minLength != null && trail.lengthKm >= f.minLength - 1e-6) hints.push(`≥${f.minLength} km`);
  if (f.terrain?.trim() && trail.terrain.toLowerCase().includes(f.terrain.trim().toLowerCase())) {
    hints.push("terrain");
  }
  if (f.region?.trim() && trail.region.toLowerCase().includes(f.region.trim().toLowerCase())) {
    hints.push("region");
  }
  if (f.scenery?.trim() && trail.scenery.toLowerCase().includes(f.scenery.trim().toLowerCase())) {
    hints.push("scenery");
  }
  if (f.search?.trim()) {
    const q = f.search.trim().toLowerCase();
    if (
      trail.name.toLowerCase().includes(q) ||
      trail.location.toLowerCase().includes(q) ||
      trail.region.toLowerCase().includes(q)
    ) {
      hints.push("text search");
    }
  }
  if (f.maxElevation != null && trail.elevationGainM <= f.maxElevation) {
    hints.push(`≤${f.maxElevation} m ascent`);
  }
  if (f.minElevation != null && trail.elevationGainM >= f.minElevation) {
    hints.push(`≥${f.minElevation} m ascent`);
  }
  const hintStr = hints.length ? ` · Matched: ${hints.join(", ")}` : "";
  return bits.join(" · ") + hintStr;
}

export function Discover() {
  const [filters, setFilters] = useState<ListTrailsParams>({
    limit: PAGE_SIZE,
    offset: 0,
  });
  const [nlText, setNlText] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [aiSummary, setAiSummary] = useState<string | null>(null);
  const [aiSource, setAiSource] = useState<"openai" | "rules" | null>(null);

  const { data, isLoading, error } = useListTrails(filters);
  const pageSize = filters.limit ?? PAGE_SIZE;
  const offset = filters.offset ?? 0;
  const total = data?.total ?? 0;
  const count = data?.trails?.length ?? 0;
  const rangeStart = total === 0 ? 0 : offset + 1;
  const rangeEnd = offset + count;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const currentPage = Math.floor(offset / pageSize) + 1;
  const canPrev = offset > 0;
  const canNext = offset + pageSize < total;

  const goToPage = (page: number) => {
    const next = Math.min(Math.max(1, page), totalPages);
    setFilters({ ...filters, offset: (next - 1) * pageSize });
  };

  const applyNlFilters = async () => {
    setAiError(null);
    setAiLoading(true);
    try {
      const r = await fetch("/api/ai/discover-parse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: nlText }),
      });
      const payload = (await r.json().catch(() => ({}))) as {
        detail?: string;
        filters?: ListTrailsParams;
        summary?: string;
        source?: "openai" | "rules";
      };
      if (!r.ok) {
        throw new Error(
          typeof payload.detail === "string" ? payload.detail : r.statusText || "Request failed",
        );
      }
      if (!payload.filters) throw new Error("Invalid response");
      // Replace filter state so omitted keys don’t leave stale region/terrain from a prior pick.
      setFilters({
        limit: PAGE_SIZE,
        offset: 0,
        ...keepVisibleFilters(payload.filters),
      });
      setAiSummary(payload.summary ?? null);
      setAiSource(payload.source ?? null);
    } catch (e) {
      setAiError(e instanceof Error ? e.message : "Request failed");
    } finally {
      setAiLoading(false);
    }
  };

  const clearAiOverlay = () => {
    setAiSummary(null);
    setAiSource(null);
  };

  const resetFilters = () => {
    setFilters({ limit: PAGE_SIZE, offset: 0 });
    clearAiOverlay();
  };

  return (
    <Layout>
      <HeroMediaSection
        imageSrc={`${import.meta.env.BASE_URL}images/hero.avif`}
        imageAlt=""
        minHeightClass="min-h-[38vh] lg:min-h-[42vh] pb-20 lg:pb-32"
      >
        <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-28 pb-6 lg:pt-40 lg:pb-10 text-center lg:text-left">
          <motion.h1 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="max-w-3xl text-4xl font-display font-extrabold tracking-tight text-white drop-shadow-[0_2px_12px_rgba(0,0,0,0.75)] sm:text-5xl lg:text-7xl"
          >
            Find your next <br className="hidden lg:block" />
            <span className="text-primary-foreground">great adventure.</span>
          </motion.h1>
          <motion.p 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="mx-auto mt-6 max-w-2xl text-lg font-medium text-white/95 drop-shadow-[0_1px_8px_rgba(0,0,0,0.7)] sm:text-xl lg:mx-0"
          >
            Discover the most beautiful hiking trails across the UK. Filter by difficulty, terrain, and distance to find the perfect route for your next journey.
          </motion.p>
        </div>
      </HeroMediaSection>

      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 relative z-20 -mt-10 lg:-mt-24">
        <div className="mb-8 rounded-2xl border border-border bg-white p-5 shadow-sm">
          <div className="flex flex-wrap items-center gap-2 mb-3">
            <Sparkles className="h-5 w-5 text-primary shrink-0" />
            <h2 className="text-lg font-bold font-display">Describe your hike</h2>
            <span className="text-xs text-muted-foreground font-medium rounded-full bg-secondary px-2 py-0.5">
              Natural language → filters
            </span>
          </div>
          <p className="text-sm text-muted-foreground mb-3 max-w-3xl">
            We map your sentence to the same structured filters as the panel (difficulty, distance, region,
            terrain, etc.). Card captions below use only each trail&apos;s listed data — no invented routes.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-end">
            <Textarea
              value={nlText}
              onChange={(e) => setNlText(e.target.value)}
              placeholder='e.g. Easy coastal walk under 10 km in Wales, not too much climbing'
              className="min-h-[88px] sm:flex-1 rounded-xl resize-y"
              disabled={aiLoading}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                  e.preventDefault();
                  void applyNlFilters();
                }
              }}
            />
            <Button
              type="button"
              className="sm:w-auto shrink-0 rounded-xl"
              disabled={aiLoading || !nlText.trim()}
              onClick={() => void applyNlFilters()}
            >
              {aiLoading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  Parsing…
                </>
              ) : (
                <>
                  <Sparkles className="h-4 w-4 mr-2" />
                  Apply filters
                </>
              )}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground mt-2">Tip: Ctrl+Enter / ⌘+Enter to apply.</p>
          {aiError && (
            <p className="text-sm text-destructive mt-3" role="alert">
              {aiError}
            </p>
          )}
          {aiSummary && (
            <div
              className="mt-4 flex flex-col gap-2 rounded-xl border border-primary/20 bg-primary/5 p-4 sm:flex-row sm:items-start sm:justify-between"
              role="status"
            >
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-foreground">{aiSummary}</p>
                {aiSource && (
                  <p className="text-xs text-muted-foreground mt-1">
                    Parser: {aiSource === "openai" ? "LLM (JSON)" : "Rule-based fallback"}
                  </p>
                )}
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="shrink-0 self-start rounded-lg"
                onClick={clearAiOverlay}
                aria-label="Dismiss explanation"
              >
                <X className="h-4 w-4 mr-1" />
                Dismiss captions
              </Button>
            </div>
          )}
        </div>

        <div className="flex flex-col lg:flex-row gap-8 items-start">
          
          <FilterPanel filters={filters} setFilters={setFilters} />

          <div className="flex-grow w-full">
            <div className="mb-6 flex items-center justify-between bg-white p-4 rounded-2xl shadow-sm border border-border">
              <h2 className="text-lg font-bold font-display flex items-center gap-2">
                <Trees className="w-5 h-5 text-primary" />
                {isLoading ? "Searching..." : `${data?.total || 0} Trails Found`}
              </h2>
            </div>

            {isLoading ? (
              <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
                <Loader2 className="w-10 h-10 animate-spin text-primary mb-4" />
                <p>Scouting the area...</p>
              </div>
            ) : error ? (
              <div className="bg-destructive/10 text-destructive p-6 rounded-2xl border border-destructive/20 text-center">
                <p className="font-bold">Failed to load trails</p>
                <p className="text-sm mt-1">Please try adjusting your filters or try again later.</p>
              </div>
            ) : (data?.trails?.length ?? 0) === 0 ? (
              <div className="bg-white p-12 rounded-2xl border border-border text-center shadow-sm">
                <div className="bg-secondary w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Compass className="w-8 h-8 text-muted-foreground" />
                </div>
                <h3 className="text-xl font-bold mb-2 text-foreground">No trails found</h3>
                <p className="text-muted-foreground mb-6">We couldn't find any trails matching your exact criteria.</p>
                {aiSummary && (
                  <p className="text-sm text-muted-foreground mb-6 max-w-md mx-auto">
                    AI filters are combined strictly (AND). If your database is small or regions don&apos;t line up,
                    try simplifying — e.g. drop &quot;coastal&quot; or name a smaller area like &quot;Pembrokeshire&quot;
                    or &quot;Cornwall&quot;.
                  </p>
                )}
                <button 
                  onClick={resetFilters}
                  className="px-6 py-2 bg-primary text-primary-foreground font-semibold rounded-xl hover:bg-primary/90 transition-colors"
                >
                  Clear Filters
                </button>
              </div>
            ) : (
              <>
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                  {data?.trails?.map((trail, i) => (
                    <motion.div
                      key={trail.id}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: i * 0.05 }}
                    >
                      <TrailCard
                        trail={trail}
                        reason={aiSummary ? groundedTrailMatchNote(trail, filters) : undefined}
                        reasonStyle="gradient"
                      />
                    </motion.div>
                  ))}
                </div>
                {totalPages > 1 && (
                  <div className="mt-8 flex flex-col gap-4 rounded-2xl border border-border bg-white p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
                    <p className="text-center text-sm text-muted-foreground sm:text-left">
                      Showing{" "}
                      <span className="font-medium text-foreground">
                        {rangeStart}–{rangeEnd}
                      </span>{" "}
                      of{" "}
                      <span className="font-medium text-foreground">{total}</span>
                    </p>
                    <div className="flex items-center justify-center gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={!canPrev || isLoading}
                        onClick={() => goToPage(currentPage - 1)}
                        className="gap-1"
                      >
                        <ChevronLeft className="h-4 w-4" />
                        Previous
                      </Button>
                      <span className="min-w-[7rem] text-center text-sm text-muted-foreground">
                        Page {currentPage} of {totalPages}
                      </span>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={!canNext || isLoading}
                        onClick={() => goToPage(currentPage + 1)}
                        className="gap-1"
                      >
                        Next
                        <ChevronRight className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </section>
    </Layout>
  );
}
