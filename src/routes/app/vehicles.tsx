import { createFileRoute } from "@tanstack/react-router";
import { EmptyState } from "../../components/empty-state";
import { PlusIcon, VehiclesIcon } from "../../components/icons";

export const Route = createFileRoute("/app/vehicles")({
  component: AppVehicles,
});

function AppVehicles() {
  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-extrabold tracking-tight text-fg">
          Vehicles
        </h1>
        <p className="mt-1 text-sm text-fg-subtle">
          Your cars, your history — each vehicle keeps its own scan history.
        </p>
      </header>

      <EmptyState
        icon={VehiclesIcon}
        eyebrow="Empty"
        title="No vehicles yet"
        description="You haven't added a vehicle. Once adding vehicles is available, each one keeps its own scan history and repair record."
        note="Add vehicle arrives with an upcoming update"
      />

      {/* Planned add button (honestly disabled) */}
      <button
        type="button"
        disabled
        aria-disabled="true"
        className="flex min-h-11 w-full items-center justify-center gap-2 rounded-lg border border-line-strong bg-surface px-4 py-3 text-base font-semibold text-slate-400"
      >
        <PlusIcon className="h-5 w-5" />
        Add vehicle — coming soon
      </button>
    </div>
  );
}
