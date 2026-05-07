import { ReactNode, useState, useEffect } from "react";
import { Link, useLocation } from "wouter";
import { Map, Compass, History, Sparkles, Menu, X, User, LogOut, LogIn } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";

export function Layout({
  children,
  /** One screen height (100dvh); hides footer; main content should use internal scroll */
  fullViewport = false,
}: {
  children: ReactNode;
  fullViewport?: boolean;
}) {
  const [location] = useLocation();
  const [isScrolled, setIsScrolled] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const { user, isAuthenticated, isLoading, login, logout } = useAuth();

  useEffect(() => {
    const handleScroll = () => setIsScrolled(window.scrollY > 20);
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  useEffect(() => {
    const close = () => setShowUserMenu(false);
    if (showUserMenu) document.addEventListener("click", close);
    return () => document.removeEventListener("click", close);
  }, [showUserMenu]);

  const navLinks = [
    { href: "/", label: "Discover", icon: Compass },
    { href: "/recommendations", label: "For You", icon: Sparkles },
    { href: "/history", label: "My History", icon: History },
  ];

  const isTrailDetailRoute = /\/trails\/\d+$/.test(location);
  const isRecommendationsRoute = /\/recommendations$/.test(location);
  const isHistoryRoute = /\/history$/.test(location);
  const isProfileRoute = /\/profile$/.test(location);

  /** Hero pages: photo under header; light header scrim keeps nav readable */
  const heroBehindHeader =
    (location === "/" ||
      isTrailDetailRoute ||
      isRecommendationsRoute ||
      isHistoryRoute ||
      isProfileRoute) &&
    !isScrolled &&
    !isMobileMenuOpen;

  return (
    <div
      className={cn(
        "flex flex-col",
        fullViewport
          ? "h-[100dvh] max-h-[100dvh] overflow-hidden"
          : "min-h-screen"
      )}
    >
      <header
        className={cn(
          "fixed top-0 left-0 right-0 z-50 transition-all duration-300",
          heroBehindHeader
            ? "border-b-1 border-white/35 bg-transparent py-3.5 shadow-none"
            : cn(
                "border-b-1 border-border bg-background/90 backdrop-blur-md shadow-sm",
                isScrolled ? "py-2.5" : "py-3.5"
              )
        )}
      >
        {heroBehindHeader && (
          <div
            className="pointer-events-none absolute inset-0 bg-gradient-to-b from-black/30 from-0% via-black/5 via-65% to-transparent"
            aria-hidden
          />
        )}
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between">
            <Link href="/" className="flex items-center gap-2 group">
              <div className="bg-primary text-primary-foreground p-2 rounded-xl group-hover:scale-105 transition-transform shadow-md">
                <Map className="w-5 h-5" />
              </div>
              <span
                className={cn(
                  "font-bold text-xl tracking-tight transition-colors drop-shadow-sm",
                  heroBehindHeader ? "text-white" : "text-foreground"
                )}
              >
                TrailGuideUK
              </span>
            </Link>

            <nav className="hidden md:flex items-center gap-6">
              {navLinks.map((link) => {
                const isActive = location === link.href;
                return (
                  <Link
                    key={link.href}
                    href={link.href}
                    className={cn(
                      "text-sm font-semibold transition-all flex items-center gap-1.5 px-1 drop-shadow-sm",
                      heroBehindHeader
                        ? isActive
                          ? "text-white border-b-2 border-white pb-0.5"
                          : "text-white/85 hover:text-white"
                        : isActive
                          ? "text-primary border-b-2 border-primary pb-0.5"
                          : "text-muted-foreground hover:text-foreground"
                    )}
                  >
                    <link.icon className="w-4 h-4" />
                    {link.label}
                  </Link>
                );
              })}

              {user && (
                <div className="relative">
                  <button
                    onClick={(e) => { e.stopPropagation(); setShowUserMenu(!showUserMenu); }}
                    className={cn(
                      "flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-semibold transition-all",
                      heroBehindHeader
                        ? "bg-white/15 text-white backdrop-blur-md border border-white/25 hover:bg-white/25"
                        : "bg-primary/10 text-primary hover:bg-primary/20"
                    )}
                  >
                    {user.profileImageUrl ? (
                      <img src={user.profileImageUrl} alt="" className="w-6 h-6 rounded-full object-cover ring-2 ring-white/30" />
                    ) : (
                      <div
                        className={cn(
                          "w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold",
                          heroBehindHeader ? "bg-white/25 text-white" : "bg-primary/20 text-primary"
                        )}
                      >
                        {user.firstName?.[0] ?? <User className="w-3 h-3" />}
                      </div>
                    )}
                    <span className="hidden lg:inline">{user.firstName ?? "Account"}</span>
                  </button>

                  {showUserMenu && (
                    <div className="absolute right-0 top-full mt-2 w-52 bg-white rounded-2xl shadow-xl border border-border py-1.5 text-sm overflow-hidden">
                      <div className="px-4 py-3 border-b border-border">
                        <p className="font-semibold text-foreground">{user.firstName} {user.lastName}</p>
                        <p className="text-muted-foreground text-xs truncate mt-0.5">{user.email}</p>
                      </div>
                      <Link
                        href="/history"
                        onClick={() => setShowUserMenu(false)}
                        className="flex items-center gap-2.5 px-4 py-2.5 hover:bg-secondary text-foreground transition-colors"
                      >
                        <History className="w-4 h-4 text-muted-foreground" />
                        My Hike Journal
                      </Link>
                      <Link
                        href="/recommendations"
                        onClick={() => setShowUserMenu(false)}
                        className="flex items-center gap-2.5 px-4 py-2.5 hover:bg-secondary text-foreground transition-colors"
                      >
                        <Sparkles className="w-4 h-4 text-muted-foreground" />
                        For You
                      </Link>
                      <Link
                        href="/profile"
                        onClick={() => setShowUserMenu(false)}
                        className="flex items-center gap-2.5 px-4 py-2.5 hover:bg-secondary text-foreground transition-colors"
                      >
                        <User className="w-4 h-4 text-muted-foreground" />
                        Profile
                      </Link>
                      <div className="border-t border-border mt-1 pt-1">
                        <button
                          onClick={logout}
                          className="w-full flex items-center gap-2.5 px-4 py-2.5 hover:bg-destructive/5 text-destructive transition-colors"
                        >
                          <LogOut className="w-4 h-4" />
                          Sign out
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </nav>

            <button
              type="button"
              aria-expanded={isMobileMenuOpen}
              aria-label={isMobileMenuOpen ? "Close menu" : "Open menu"}
              className={cn(
                "md:hidden p-2 rounded-lg transition-colors",
                heroBehindHeader && !isMobileMenuOpen
                  ? "text-white hover:bg-white/15"
                  : "text-foreground hover:bg-muted/80"
              )}
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            >
              {isMobileMenuOpen ? (
                <X className="w-6 h-6" />
              ) : (
                <Menu className="w-6 h-6 drop-shadow-sm" />
              )}
            </button>
          </div>
        </div>

        {isMobileMenuOpen && (
          <div className="md:hidden absolute top-full left-0 right-0 bg-white border-b border-border shadow-lg py-4 px-4 flex flex-col gap-2 animate-in slide-in-from-top-2">
            {navLinks.map((link) => {
              const isActive = location === link.href;
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  onClick={() => setIsMobileMenuOpen(false)}
                  className={cn(
                    "p-3 rounded-xl flex items-center gap-3 text-base font-semibold transition-colors",
                    isActive ? "bg-primary/10 text-primary" : "text-foreground hover:bg-secondary"
                  )}
                >
                  <link.icon className="w-5 h-5" />
                  {link.label}
                </Link>
              );
            })}

            <div className="pt-2 border-t border-border">
              {!isLoading && (
                isAuthenticated && user ? (
                  <div className="flex flex-col gap-2">
                    <div className="flex items-center gap-3 px-3 py-2">
                      {user.profileImageUrl ? (
                        <img src={user.profileImageUrl} alt="" className="w-8 h-8 rounded-full object-cover" />
                      ) : (
                        <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center">
                          <User className="w-4 h-4 text-primary" />
                        </div>
                      )}
                      <div>
                        <p className="font-semibold text-sm">{user.firstName} {user.lastName}</p>
                        <p className="text-xs text-muted-foreground">{user.email}</p>
                      </div>
                    </div>
                    <button
                      onClick={() => { setIsMobileMenuOpen(false); logout(); }}
                      className="flex items-center gap-2 px-3 py-2 rounded-xl text-destructive hover:bg-destructive/10 font-semibold"
                    >
                      <LogOut className="w-4 h-4" />
                      Sign out
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => { setIsMobileMenuOpen(false); login(); }}
                    className="w-full flex items-center justify-center gap-2 p-3 bg-primary text-primary-foreground rounded-xl font-semibold"
                  >
                    <LogIn className="w-5 h-5" />
                    Sign in / Create account
                  </button>
                )
              )}
            </div>
          </div>
        )}
      </header>

      <main
        className={cn(
          "flex-grow",
          fullViewport && "flex min-h-0 flex-1 flex-col overflow-hidden"
        )}
      >
        {children}
      </main>

      {!fullViewport && (
        <footer className="bg-foreground text-background py-10 mt-20">
          <div className="max-w-7xl mx-auto px-4 text-center text-sm opacity-60">
            <p>© 2026 TrailGuideUK — Discover your next adventure.</p>
          </div>
        </footer>
      )}
    </div>
  );
}
