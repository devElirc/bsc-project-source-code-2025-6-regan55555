import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import { Discover } from "@/pages/Discover";
import { TrailDetail } from "@/pages/TrailDetail";
import { Recommendations } from "@/pages/Recommendations";
import { History } from "@/pages/History";
import { AuthGate } from "@/components/AuthGate";
import { Profile } from "@/pages/Profile";
import { LoginPage } from "@/pages/LoginPage";
import { AuthProvider } from "@/hooks/useAuth";
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      staleTime: 5 * 60 * 1000,
    },
  },
});

function Router() {
  return (
    <Switch>
      <Route path="/" component={Discover} />
      <Route path="/login" component={LoginPage} />
      <Route path="/trails/:id" component={TrailDetail} />
      <Route path="/recommendations" component={Recommendations} />
      <Route path="/history" component={History} />
      <Route path="/profile" component={Profile} />
      <Route path="/profile/:rest*" component={Profile} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <AuthProvider>
          <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "") || "/"}>
            <AuthGate>
              <Router />
            </AuthGate>
          </WouterRouter>
        </AuthProvider>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
