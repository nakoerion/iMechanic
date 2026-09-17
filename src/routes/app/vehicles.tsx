import { useEffect, useState, type FormEvent } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Card, ScreenHeader } from "../../components/app-shell";
import { EmptyState } from "../../components/empty-state";
import {
  AlertIcon,
  CheckIcon,
  PlusIcon,
  SpinnerIcon,
  VehiclesIcon,
} from "../../components/icons";
import { Button } from "../../components/ui/button";
import { APP_COPY } from "../../lib/copy";
import {
  createVehicle,
  listVehicles,
  type VehicleOption,
} from "../../server/scans";

export const Route = createFileRoute("/app/vehicles")({
  component: AppVehicles,
});

const v = APP_COPY.vehicles;

/** The oldest model year the backend will store (see createVehicleCore). */
const MIN_YEAR = 1980;

const INPUT_CLASS =
  "mt-1 h-12 w-full rounded-control border-2 border-line-strong bg-surface px-3 text-base text-fg placeholder:text-fg-subtle focus:border-brand focus:outline-none";

type ListState =
  | { kind: "loading" }
  | { kind: "ready"; vehicles: VehicleOption[] }
  | { kind: "error" };

type FieldErrors = { make?: string; model?: string; year?: string };

/**
 * Make + model only — the year is rendered separately. Every part is optional
 * in the database, so a missing piece is simply left out — never filled with a guess.
 */
function vehicleName(vehicle: VehicleOption): string {
  return [vehicle.make, vehicle.model].filter(Boolean).join(" ") || v.unnamed;
}

/** Year is optional. If given it must be one the backend will actually keep. */
function parseYear(raw: string): { year: number | null; error?: string } {
  const trimmed = raw.trim();
  if (trimmed === "") return { year: null };
  if (!/^\d{4}$/.test(trimmed)) return { year: null, error: v.yearInvalid };
  const parsed = Number(trimmed);
  const newest = new Date().getFullYear() + 1;
  if (parsed < MIN_YEAR || parsed > newest) {
    return { year: null, error: v.yearInvalid };
  }
  return { year: parsed };
}

function AppVehicles() {
  const [state, setState] = useState<ListState>({ kind: "loading" });
  const [attempt, setAttempt] = useState(0);

  const [formOpen, setFormOpen] = useState(false);
  const [make, setMake] = useState("");
  const [model, setModel] = useState("");
  const [year, setYear] = useState("");
  const [errors, setErrors] = useState<FieldErrors>({});
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setState({ kind: "loading" });
    listVehicles()
      .then((list) => {
        if (!cancelled) {
          setState({ kind: "ready", vehicles: Array.isArray(list) ? list : [] });
        }
      })
      .catch(() => {
        if (!cancelled) setState({ kind: "error" });
      });
    return () => {
      cancelled = true;
    };
  }, [attempt]);

  function resetForm() {
    setMake("");
    setModel("");
    setYear("");
    setErrors({});
    setSaveError(null);
  }

  function openForm() {
    resetForm();
    setNotice(null);
    setFormOpen(true);
  }

  function closeForm() {
    resetForm();
    setFormOpen(false);
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmedMake = make.trim();
    const trimmedModel = model.trim();
    const parsed = parseYear(year);

    const next: FieldErrors = {};
    if (!trimmedMake) next.make = v.makeRequired;
    if (!trimmedModel) next.model = v.modelRequired;
    if (parsed.error) next.year = parsed.error;
    setErrors(next);
    if (Object.keys(next).length > 0) return;

    setSaving(true);
    setSaveError(null);
    try {
      await createVehicle({
        data: {
          make: trimmedMake,
          model: trimmedModel,
          year: parsed.year,
        },
      });
      setNotice(v.saved);
      closeForm();
      // Re-read from the server rather than trusting what we sent: the list
      // then shows exactly what was stored (nothing invented, nothing hidden).
      try {
        const list = await listVehicles();
        setState({
          kind: "ready",
          vehicles: Array.isArray(list) ? list : [],
        });
      } catch {
        setNotice(v.refreshError);
      }
    } catch (err) {
      const detail =
        err instanceof Error && err.message.trim() ? err.message.trim() : null;
      setSaveError(detail ? `${v.saveError} (${detail})` : v.saveError);
    } finally {
      setSaving(false);
    }
  }

  const vehicles = state.kind === "ready" ? state.vehicles : [];
  const isEmpty = state.kind === "ready" && vehicles.length === 0;

  return (
    <div className="space-y-6">
      <ScreenHeader title={v.title} description={v.description} />

      {state.kind === "loading" && (
        <p
          role="status"
          className="flex items-center justify-center gap-2 rounded-card border border-line bg-surface px-6 py-10 text-sm font-medium text-fg-muted"
        >
          <SpinnerIcon className="h-5 w-5 animate-spin" aria-hidden />
          {v.loading}
        </p>
      )}

      {state.kind === "error" && (
        <section className="flex flex-col items-center rounded-card border border-line bg-surface px-6 py-10 text-center shadow-sm">
          <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-neutral-fill text-danger-fg">
            <AlertIcon className="h-6 w-6" aria-hidden />
          </span>
          <h2 className="mt-4 text-lg font-bold text-fg">{v.errorTitle}</h2>
          <p className="mt-2 max-w-sm text-sm leading-relaxed text-fg-muted">
            {v.errorDescription}
          </p>
          <Button
            variant="secondary"
            className="mt-5"
            onClick={() => setAttempt((n) => n + 1)}
          >
            {v.retry}
          </Button>
        </section>
      )}

      {isEmpty && !formOpen && (
        <EmptyState
          icon={VehiclesIcon}
          eyebrow={v.emptyEyebrow}
          title={v.emptyTitle}
          description={v.emptyDescription}
          action={
            <Button
              fullWidth
              leadingIcon={<PlusIcon className="h-5 w-5" aria-hidden />}
              onClick={openForm}
            >
              {v.emptyAction}
            </Button>
          }
        />
      )}

      {state.kind === "ready" && vehicles.length > 0 && (
        <>
          <h2 className="text-xs font-semibold uppercase tracking-wider text-fg-subtle">
            {v.countLabel(vehicles.length)}
          </h2>
          <ul className="space-y-3">
            {vehicles.map((vehicle) => (
              <VehicleRow key={vehicle.id} vehicle={vehicle} />
            ))}
          </ul>
        </>
      )}

      {state.kind === "ready" && !formOpen && vehicles.length > 0 && (
        <Button
          fullWidth
          variant="secondary"
          leadingIcon={<PlusIcon className="h-5 w-5" aria-hidden />}
          onClick={openForm}
        >
          {v.addButton}
        </Button>
      )}

      {state.kind === "ready" && notice && (
        <p
          role="status"
          className="flex items-start gap-2 rounded-card border border-line bg-surface p-3 text-xs font-medium text-fg-muted"
        >
          <CheckIcon className="mt-0.5 h-4 w-4 shrink-0 text-fg-subtle" aria-hidden />
          {notice}
        </p>
      )}

      {state.kind === "ready" && formOpen && (
        <Card as="div">
          <h2 className="text-lg font-bold text-fg">{v.formTitle}</h2>
          <p className="mt-1 text-xs leading-relaxed text-fg-subtle">
            {v.formHint}
          </p>

          <form className="mt-4 space-y-3" onSubmit={onSubmit} noValidate>
            <div>
              <label
                htmlFor="vehicle-make"
                className="block text-xs font-semibold text-fg"
              >
                {v.makeLabel}
              </label>
              <input
                id="vehicle-make"
                name="make"
                maxLength={80}
                value={make}
                onChange={(e) => setMake(e.target.value)}
                placeholder={v.makeHint}
                autoComplete="off"
                enterKeyHint="next"
                aria-invalid={errors.make ? true : undefined}
                aria-describedby={errors.make ? "vehicle-make-error" : undefined}
                className={INPUT_CLASS}
              />
              {errors.make && (
                <p
                  id="vehicle-make-error"
                  role="alert"
                  className="mt-1 text-xs font-medium text-danger-fg"
                >
                  {errors.make}
                </p>
              )}
            </div>

            <div>
              <label
                htmlFor="vehicle-model"
                className="block text-xs font-semibold text-fg"
              >
                {v.modelLabel}
              </label>
              <input
                id="vehicle-model"
                name="model"
                maxLength={80}
                value={model}
                onChange={(e) => setModel(e.target.value)}
                placeholder={v.modelHint}
                autoComplete="off"
                enterKeyHint="next"
                aria-invalid={errors.model ? true : undefined}
                aria-describedby={
                  errors.model ? "vehicle-model-error" : undefined
                }
                className={INPUT_CLASS}
              />
              {errors.model && (
                <p
                  id="vehicle-model-error"
                  role="alert"
                  className="mt-1 text-xs font-medium text-danger-fg"
                >
                  {errors.model}
                </p>
              )}
            </div>

            <div>
              <label
                htmlFor="vehicle-year"
                className="block text-xs font-semibold text-fg"
              >
                {v.yearLabel}
              </label>
              <input
                id="vehicle-year"
                name="year"
                value={year}
                onChange={(e) => setYear(e.target.value)}
                placeholder={v.yearPlaceholder}
                inputMode="numeric"
                autoComplete="off"
                aria-invalid={errors.year ? true : undefined}
                aria-describedby={
                  errors.year ? "vehicle-year-error" : undefined
                }
                className={INPUT_CLASS}
              />
              {errors.year && (
                <p
                  id="vehicle-year-error"
                  role="alert"
                  className="mt-1 text-xs font-medium text-danger-fg"
                >
                  {errors.year}
                </p>
              )}
            </div>

            {saveError && (
              <p
                role="alert"
                className="flex items-start gap-2 rounded-card border border-danger-border bg-danger-fill p-3 text-xs leading-relaxed text-danger-fg"
              >
                <AlertIcon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                {saveError}
              </p>
            )}

            <div className="flex flex-col gap-2 pt-1 sm:flex-row-reverse">
              <Button
                type="submit"
                fullWidth
                loading={saving}
                loadingLabel={v.saving}
              >
                {v.saveButton}
              </Button>
              <Button
                type="button"
                variant="ghost"
                fullWidth
                onClick={closeForm}
              >
                {v.cancel}
              </Button>
            </div>
          </form>
        </Card>
      )}
    </div>
  );
}

function VehicleRow({ vehicle }: { vehicle: VehicleOption }) {
  return (
    <li className="rounded-card border border-line bg-surface p-4 shadow-sm">
      <div className="flex items-center gap-3">
        <span
          aria-hidden
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-neutral-fill text-fg-muted"
        >
          <VehiclesIcon className="h-5 w-5" />
        </span>
        <div className="min-w-0">
          <p className="text-sm font-bold text-fg">{vehicleName(vehicle)}</p>
          {/* A stored year is shown plainly; a missing one is left out rather
              than guessed at. */}
          {vehicle.year !== null && (
            <p className="mt-0.5 text-xs font-medium text-fg-subtle">
              {v.yearPrefix} {vehicle.year}
            </p>
          )}
        </div>
      </div>
    </li>
  );
}
