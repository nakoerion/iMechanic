import { createFileRoute } from "@tanstack/react-router";
import { EmptyState } from "../../components/empty-state";
import { HistoryIcon } from "../../components/icons";

export const Route = createFileRoute("/app/history")({
  component: AppHistory,
});

function AppHistory() {
  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-extrabold tracking-tight text-fg">
          History
        </h1>
        <p className="mt-1 text-sm text-fg-subtle">
          Every scan, diagnosis and repair — saved and searchable.
        </p>
      </header>

      <EmptyState
        icon={HistoryIcon}
        eyebrow="Empty"
        title="No scans yet"
        description="Your complete history of scans, verdicts and repairs will appear here. Nothing is shown until there's something real to show."
        note="History fills in once scanning is live"
      />
    </div>
  );
}
