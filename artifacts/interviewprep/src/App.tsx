import { type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import NotFound from '@/pages/not-found';
import { Redirect, Route, Switch, useLocation, Router as WouterRouter } from 'wouter';
import { AuthProvider } from '@/auth';
import { AppHeader, AuthPage, GuestOnly, Protected } from '@/components/ip';
import { DashboardPage } from '@/components/dashboard';
import { EditSessionPage, NewSessionPage, SessionCacheGuard, SessionDetailPage, SessionsListPage, StarredPage } from '@/components/sessions';
import { StoriesListPage } from '@/components/stories-list';
import { EditStoryPage, NewStoryPage } from '@/components/stories-form';
import { StoryDetailPage } from '@/components/story-detail';
import { RubricPage } from '@/components/rubric-page';

const queryClient = new QueryClient();

function Router() {
  return (
    <RoutedErrorBoundary>
      <Switch>
        <Route path="/"><Redirect to="/dashboard" /></Route>
        <Route path="/dashboard"><Protected><DashboardPage /></Protected></Route>
        <Route path="/sessions"><Protected><SessionsListPage /></Protected></Route>
        <Route path="/starred"><Protected><StarredPage /></Protected></Route>
        <Route path="/sessions/new"><Protected><NewSessionPage /></Protected></Route>
        <Route path="/sessions/:id/edit">{(p) => <Protected><EditSessionPage key={p.id} rawId={p.id} /></Protected>}</Route>
        <Route path="/sessions/:id">{(p) => <Protected><SessionDetailPage key={p.id} rawId={p.id} /></Protected>}</Route>
        <Route path="/stories"><Protected><StoriesListPage /></Protected></Route>
        <Route path="/stories/new"><Protected><NewStoryPage /></Protected></Route>
        <Route path="/stories/:id/edit">{(p) => <Protected><EditStoryPage key={p.id} rawId={p.id} /></Protected>}</Route>
        <Route path="/stories/:id">{(p) => <Protected><StoryDetailPage key={p.id} rawId={p.id} /></Protected>}</Route>
        <Route path="/rubric"><Protected><RubricPage /></Protected></Route>
        <Route path="/login"><GuestOnly><AuthPage mode="login" /></GuestOnly></Route>
        <Route path="/signup"><GuestOnly><AuthPage key="signup" mode="signup" /></GuestOnly></Route>
        <Route><Protected><AppHeader /><NotFound /></Protected></Route>
      </Switch>
    </RoutedErrorBoundary>
  );
}

function RoutedErrorBoundary({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  return <ErrorBoundary resetKey={location}>{children}</ErrorBoundary>;
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <AuthProvider>
          <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}>
            <SessionCacheGuard />
            <Router />
          </WouterRouter>
        </AuthProvider>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
