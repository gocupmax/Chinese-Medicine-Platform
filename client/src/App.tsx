import { Switch, Route, Router } from "wouter";
import { useHashLocation } from "wouter/use-hash-location";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "./lib/queryClient";
import { Toaster } from "@/components/ui/toaster";
import { useIsMobile } from "@/hooks/use-mobile";
import AdminDashboard from "@/pages/admin-dashboard";
import MobileStudy from "@/pages/mobile-study";
import QuizPage from "@/pages/quiz-page";
import SubjectDetail from "@/pages/subject-detail";
import StudyContentPage from "@/pages/study-content-page";
import NotFound from "@/pages/not-found";
import { PerplexityAttribution } from "@/components/PerplexityAttribution";

function AppRouter() {
  const isMobile = useIsMobile();

  return (
    <div className="min-h-screen bg-background">
      <Router hook={useHashLocation}>
        <Switch>
          <Route path="/" component={isMobile ? MobileStudy : AdminDashboard} />
          <Route path="/admin" component={AdminDashboard} />
          <Route path="/study" component={MobileStudy} />
          <Route path="/subject/:id" component={SubjectDetail} />
          <Route path="/quiz/m/:materialIds" component={QuizPage} />
          <Route path="/quiz/:subjectId" component={QuizPage} />
          <Route component={NotFound} />
        </Switch>
      </Router>
      <PerplexityAttribution />
    </div>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AppRouter />
      <Toaster />
    </QueryClientProvider>
  );
}

export default App;
