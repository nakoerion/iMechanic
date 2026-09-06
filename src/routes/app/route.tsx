import {
  Outlet,
  createFileRoute,
  redirect,
} from "@tanstack/react-router";
import { AppShell, ScreenContainer } from "../../components/app-shell";
import { getCurrentUser } from "../../server/auth";

export const Route = createFileRoute("/app")({
  /* noindex until scanning ships in S3 (QA defect D26): every /app screen
     currently says the feature isn't built yet — that must not be what a
     search engine indexes as the product. Remove when S3 goes live. */
  head: () => ({
    meta: [{ name: "robots", content: "noindex" }],
  }),
  beforeLoad: async ({ location }) => {
    // Route protection (Slice S2): the whole /app tree requires a session —
    // except the two public auth surfaces /app/signin and /app/verify, which
    // are the way IN. Authenticated SSR and client navigations both run this.
    if (
      location.pathname.startsWith("/app/signin") ||
      location.pathname.startsWith("/app/verify")
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