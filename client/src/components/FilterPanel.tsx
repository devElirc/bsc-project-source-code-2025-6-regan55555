import { Search, SlidersHorizontal, X } from "lucide-react";
import { useState } from "react";
import { useGetFilterOptions, ListTrailsParams } from "@workspace/api-client-react";
import { cn } from "@/lib/utils";

interface FilterPanelProps {
  filters: ListTrailsParams;
  setFilters: (filters: ListTrailsParams) => void;
}

export function FilterPanel({ filters, setFilters }: FilterPanelProps) {
  const { data: options } = useGetFilterOptions();
  const [isOpen, setIsOpen] = useState(false);

  const updateFilter = (key: keyof ListTrailsParams, value: any) => {
    setFilters({ ...filters, [key]: value || undefined, offset: 0 });
  };

  const clearFilters = () => {
    setFilters({ limit: filters.limit ?? 20, offset: 0 });
  };

  const difficulties = ["easy", "moderate", "hard", "expert"];

  const regions = options?.regions ?? [];
  const terrains = options?.terrains ?? [];
  const regionValue = filters.region ?? "";
  const terrainValue = filters.terrain ?? "";
  /** AI/substring filters may use values not listed as distinct options; selects need a matching <option>. */
  const regionExtra = regionValue && !regions.includes(regionValue);
  const terrainExtra = terrainValue && !terrains.includes(terrainValue);

  const FilterContent = () => (
    <div className="space-y-6">
      <div>
        <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 block">
          Search
        </label>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Trail name or location..."
            value={filters.search || ""}
            onChange={(e) => updateFilter("search", e.target.value)}
            className="w-full pl-9 pr-4 py-2.5 bg-background border border-border rounded-xl text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all outline-none"
          />
        </div>
      </div>

      <div>
        <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 block">
          Difficulty
        </label>
        <div className="flex flex-wrap gap-2">
          {difficulties.map((diff) => (
            <button
              key={diff}
              onClick={() => updateFilter("difficulty", filters.difficulty === diff ? undefined : diff)}
              className={cn(
                "px-3 py-1.5 rounded-lg text-sm font-medium capitalize transition-all",
                filters.difficulty === diff
                  ? "bg-primary text-primary-foreground shadow-md"
                  : "bg-secondary text-secondary-foreground hover:bg-secondary/70"
              )}
            >
              {diff}
            </button>
          ))}
        </div>
      </div>

      <div>
        <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 block">
          Region
        </label>
        <select
          value={regionValue}
          onChange={(e) => updateFilter("region", e.target.value)}
          className="w-full px-4 py-2.5 bg-background border border-border rounded-xl text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none"
        >
          <option value="">All Regions</option>
          {regionExtra && (
            <option value={regionValue}>{regionValue} (active filter)</option>
          )}
          {regions.map((r) => (
            <option key={r} value={r}>{r}</option>
          ))}
        </select>
      </div>

      <div>
        <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 block">
          Terrain
        </label>
        <select
          value={terrainValue}
          onChange={(e) => updateFilter("terrain", e.target.value)}
          className="w-full px-4 py-2.5 bg-background border border-border rounded-xl text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none"
        >
          <option value="">Any Terrain</option>
          {terrainExtra && (
            <option value={terrainValue}>{terrainValue} (partial / AI)</option>
          )}
          {terrains.map((t) => (
            <option key={t} value={t} className="capitalize">{t}</option>
          ))}
        </select>
      </div>

      <div>
        <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 block">
          Length (Max Km)
        </label>
        <div className="flex items-center gap-4">
          <input
            type="range"
            min="1"
            max="1000"
            value={Math.min(1000, Math.max(1, filters.maxLength ?? 50))}
            onChange={(e) => updateFilter("maxLength", parseInt(e.target.value, 10))}
            className="flex-grow accent-primary"
          />
          <span className="text-sm font-medium min-w-[3.5rem] text-right tabular-nums">
            {filters.maxLength ?? 50}km
          </span>
        </div>
      </div>

      <button
        onClick={clearFilters}
        className="w-full py-2.5 border border-border text-foreground font-semibold rounded-xl hover:bg-secondary transition-colors"
      >
        Reset Filters
      </button>
    </div>
  );

  return (
    <>
      {/* Mobile Toggle Button */}
      <div className="lg:hidden mb-6 flex justify-end">
        <button
          onClick={() => setIsOpen(true)}
          className="flex items-center gap-2 bg-white px-4 py-2 rounded-xl shadow-sm border border-border font-semibold text-sm"
        >
          <SlidersHorizontal className="w-4 h-4" />
          Filters
        </button>
      </div>

      {/* Desktop Sidebar */}
      <div className="hidden lg:block w-72 flex-shrink-0">
        <div className="bg-white rounded-2xl p-6 shadow-sm border border-border sticky top-24">
          <div className="flex items-center gap-2 mb-6 text-foreground font-display font-bold text-xl">
            <SlidersHorizontal className="w-5 h-5 text-primary" />
            Filters
          </div>
          <FilterContent />
        </div>
      </div>

      {/* Mobile Drawer */}
      {isOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex justify-end">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setIsOpen(false)} />
          <div className="relative w-full max-w-xs bg-white h-full shadow-2xl p-6 overflow-y-auto animate-in slide-in-from-right">
            <div className="flex items-center justify-between mb-8">
              <div className="flex items-center gap-2 font-display font-bold text-xl">
                <SlidersHorizontal className="w-5 h-5 text-primary" />
                Filters
              </div>
              <button onClick={() => setIsOpen(false)} className="p-2 bg-secondary rounded-full">
                <X className="w-5 h-5" />
              </button>
            </div>
            <FilterContent />
          </div>
        </div>
      )}
    </>
  );
}
