import { Outlet, createFileRoute } from "@tanstack/react-router";
import { AppShell, ScreenContainer } from "../../components/app-shell";

export const Route = createFileRoute("/app")({
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
