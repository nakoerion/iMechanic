import {
  Outlet,
  createFileRoute,
  redirect,
} from "@tanstack/react-router";
import { AppShell, ScreenContainer } from "../../components/app-shell";
import { getCurrentUser } from "../../server/auth";

export const Route = createFileRoute("/app")({
  beforeLoad: async ({ location }) => {
    // Route protection (Slice S2): the whole /app tree requires a session —
    // except the public auth surfaces /app/signin and /app/verify, which are the
    // way IN, and /app/account-deleted (S9c), which is where a user lands the
    // moment their session has just been deleted. Requiring a session there
    // would bounce a successfully deleted account to the sign-in screen.
    // Authenticated SSR and client navigations both run this.
    if (
      location.pathname.startsWith("/app/signin") ||
      location.pathname.startsWith("/app/verify") ||
      location.pathname.startsWith("/app/account-deleted")
    ) {
      return;
    }
    const user = await getCurrentUser();
    if (!user) throw redirect({ to: "/app/signin" });
  },
  component: AppLayout,
});

/**
 * App chrome lives in `src/components/app-shell.tsx` so every screen — and the
 * native Capacitor wrappers later — get the same header, navigation, safe-area
 * handling and 480px reading column.
 */
function AppLayout() {
  return (
    <AppShell>
      <ScreenContainer>
        <Outlet />
      </ScreenContainer>
    </AppShell>
  );
}