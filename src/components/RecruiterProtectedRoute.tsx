import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useAccountType } from "@/contexts/AccountTypeContext";
import { Loader2 } from "lucide-react";

const RecruiterProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const { user, loading: authLoading, initialized } = useAuth();
  const { accountType, loading: atLoading, dbAccountType, switchView } = useAccountType();
  const location = useLocation();

  if (!initialized || authLoading || atLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) return <Navigate to="/login" state={{ from: location }} replace />;

  // If the user's DB account type is recruiter OR they've ever set up recruiter
  // (onboarding completed), allow access to recruiter routes
  // Also switch the active view to recruiter since they're on a recruiter route
  if (accountType !== "recruiter") {
    // Check if their DB type is recruiter - if so, auto-switch
    if (dbAccountType === "recruiter") {
      switchView("recruiter");
      return (
        <div className="min-h-screen flex items-center justify-center bg-background">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      );
    }
    return <Navigate to="/dashboard" replace />;
  }

  return <>{children}</>;
};

export default RecruiterProtectedRoute;
