import { Outlet, createFileRoute } from "@tanstack/react-router";
import { AppShell, ScreenContainer } from "../../components/app-shell";

export const Route = createFileRoute("/app")({
  /* noindex until scanning ships in S3 (QA defect D26): every /app screen
     currently says the feature isn't built yet — that must not be what a
     search engine indexes as the product. Remove when S3 goes live. */
  head: () => ({
    meta: [{ name: "robots", content: "noindex" }],
  }),
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
