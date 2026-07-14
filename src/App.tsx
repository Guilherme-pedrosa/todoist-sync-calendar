import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes, Navigate } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import AppLayout from "./pages/AppLayout";
import { Suspense, lazy } from "react";
import { Loader2 } from "lucide-react";

// Lazy-load todas as rotas para reduzir o bundle inicial (grande ganho em mobile/3G/4G)
const InboxPage = lazy(() => import("./pages/views/InboxPage"));
const TodayPage = lazy(() => import("./pages/views/TodayPage"));
const UpcomingPage = lazy(() => import("./pages/views/UpcomingPage"));
const CompletedPage = lazy(() => import("./pages/views/CompletedPage"));
const ProjectPage = lazy(() => import("./pages/views/ProjectPage"));
const LabelPage = lazy(() => import("./pages/views/LabelPage"));
const LabelsIndexPage = lazy(() => import("./pages/views/LabelsIndexPage"));
const FilterPage = lazy(() => import("./pages/views/FilterPage"));
const FiltersIndexPage = lazy(() => import("./pages/views/FiltersIndexPage"));
const SettingsPage = lazy(() => import("./pages/SettingsPage"));
const MembersPage = lazy(() => import("./pages/team/MembersPage"));
const TeamsPage = lazy(() => import("./pages/team/TeamsPage"));
const SharedProjectsPage = lazy(() => import("./pages/team/SharedProjectsPage"));
const WorkloadPage = lazy(() => import("./pages/team/WorkloadPage"));
const ConversationsPage = lazy(() => import("./pages/Conversations"));
const TranskriptorPage = lazy(() => import("./pages/TranskriptorPage"));
const ProductivityPage = lazy(() => import("./pages/ProductivityPage"));
const ExtensionPage = lazy(() => import("./pages/ExtensionPage"));
const EmbedChat = lazy(() => import("./pages/EmbedChat"));
const Auth = lazy(() => import("./pages/Auth"));
const NotFound = lazy(() => import("./pages/NotFound"));
const DashboardPage = lazy(() => import("./pages/DashboardPage"));
const DashboardAdminPage = lazy(() => import("./pages/DashboardAdminPage"));

const queryClient = new QueryClient();

function RouteFallback() {
  return (
    <div className="flex items-center justify-center h-[60vh]">
      <Loader2 className="h-6 w-6 animate-spin text-primary" />
    </div>
  );
}

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
          <Suspense fallback={<RouteFallback />}>
            <Routes>
              <Route path="/auth" element={<Auth />} />
              <Route path="/embed/chat" element={<EmbedChat />} />
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
                <Route path="/transkriptor" element={<TranskriptorPage />} />
                <Route path="/produtividade" element={<ProductivityPage />} />
                <Route path="/extensao" element={<ExtensionPage />} />
                <Route path="/dashboard" element={<DashboardPage />} />
                <Route path="/dashboard-admin" element={<DashboardAdminPage />} />
              </Route>
              <Route path="*" element={<NotFound />} />
            </Routes>
          </Suspense>
        </BrowserRouter>
      </TooltipProvider>
    </AuthProvider>
  </QueryClientProvider>
);

export default App;
