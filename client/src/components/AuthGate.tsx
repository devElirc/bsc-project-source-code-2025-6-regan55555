import { ReactNode, useEffect } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/hooks/useAuth";
import { Loader2, Map } from "lucide-react";
import { LoginPage } from "@/pages/LoginPage";

interface AuthGateProps {
  children: ReactNode;
}

export function AuthGate({ children }: AuthGateProps) {
  const [location, navigate] = useLocation();
  const { isAuthenticated, isLoading } = useAuth();

  // Redirect unauthenticated users to /login so the URL reflects the login page
  useEffect(() => {
    if (isLoading) return;
    if (!isAuthenticated && location !== "/login") {
      navigate("/login", { replace: true });
    }
  }, [isLoading, isAuthenticated, location, navigate]);

  // If authenticated but still on /login (e.g. after sign in), go home
  useEffect(() => {
    if (!isLoading && isAuthenticated && location === "/login") {
      navigate("/", { replace: true });
    }
  }, [isLoading, isAuthenticated, location, navigate]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <div className="bg-primary p-3 rounded-2xl">
            <Map className="w-8 h-8 text-white" />
          </div>
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <LoginPage />;
  }

  // Avoid flashing NotFound when authenticated but URL still /login (redirect in progress)
  if (location === "/login") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return <>{children}</>;
}
