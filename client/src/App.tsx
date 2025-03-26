import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import NotFound from "@/pages/not-found";
import ChatPage from "@/pages/chat-page";
import HomeworkHelpPage from "@/pages/homework-help-page";

function Router() {
  return (
    <Switch>
      <Route path="/" component={ChatPage} />
      <Route path="/homework-help" component={HomeworkHelpPage} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <Router />
      <Toaster />
    </QueryClientProvider>
  );
}

export default App;
