import { createBrowserRouter } from "react-router";
import { Dashboard } from "./pages/Dashboard";
import { Onboarding } from "./pages/Onboarding";
import { AIRescheduler } from "./pages/AIRescheduler";
import { Statistics } from "./pages/Statistics";
import { Settings } from "./pages/Settings";

export const router = createBrowserRouter([
  {
    path: "/",
    Component: Dashboard,
  },
  {
    path: "/onboarding",
    Component: Onboarding,
  },
  {
    path: "/reschedule",
    Component: AIRescheduler,
  },
  {
    path: "/stats",
    Component: Statistics,
  },
  {
    path: "/settings",
    Component: Settings,
  },
]);
