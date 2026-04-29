import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes, Navigate } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import AppLayout from "./pages/AppLayout";
import InboxPage from "./pages/views/InboxPage";
import TodayPage from "./pages/views/TodayPage";
import UpcomingPage from "./pages/views/UpcomingPage";
import CompletedPage from "./pages/views/CompletedPage";
import ProjectPage from "./pages/views/ProjectPage";
import LabelPage from "./pages/views/LabelPage";
import LabelsIndexPage from "./pages/views/LabelsIndexPage";
import FilterPage from "./pages/views/FilterPage";
import FiltersIndexPage from "./pages/views/FiltersIndexPage";
import SettingsPage from "./pages/SettingsPage";
import MembersPage from "./pages/team/MembersPage";
import TeamsPage from "./pages/team/TeamsPage";
import SharedProjectsPage from "./pages/team/SharedProjectsPage";
import WorkloadPage from "./pages/team/WorkloadPage";
import ConversationsPage from "./pages/Conversations";
import Auth from "./pages/Auth";
import CalendarCallback from "./pages/CalendarCallback";
import NotFound from "./pages/NotFound";
import { Loader2 } from "lucide-react";

const queryClient = new QueryClient();

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }
  if (!user) return <Navigate to="/auth" replace />;
  return <>{children}</>;
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <Routes>
            <Route path="/auth" element={<Auth />} />
            <Route
              path="/calendar-callback"
              element={
                <ProtectedRoute>
                  <CalendarCallback />
                </ProtectedRoute>
              }
            />
            <Route
              element={
                <ProtectedRoute>
                  <AppLayout />
                </ProtectedRoute>
              }
            >
              <Route path="/" element={<Navigate to="/today" replace />} />
              <Route path="/inbox" element={<InboxPage />} />
              <Route path="/today" element={<TodayPage />} />
              <Route path="/upcoming" element={<UpcomingPage />} />
              <Route path="/completed" element={<CompletedPage />} />
              <Route path="/projects/:projectId" element={<ProjectPage />} />
              <Route path="/labels" element={<LabelsIndexPage />} />
              <Route path="/labels/:labelId" element={<LabelPage />} />
              <Route path="/filters" element={<FiltersIndexPage />} />
              <Route path="/filters/:filterId" element={<FilterPage />} />
              <Route path="/settings" element={<SettingsPage />} />
              <Route path="/team/members" element={<MembersPage />} />
              <Route path="/team/teams" element={<TeamsPage />} />
              <Route path="/team/projects" element={<SharedProjectsPage />} />
              <Route path="/team/workload" element={<WorkloadPage />} />
              <Route path="/conversations" element={<ConversationsPage />} />
              <Route path="/conversations/:id" element={<ConversationsPage />} />
            </Route>
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </TooltipProvider>
    </AuthProvider>
  </QueryClientProvider>
);

export default App;
