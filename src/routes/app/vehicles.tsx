import { useEffect, useMemo, useState, type FormEvent } from "react";
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
import { ProUpgradePrompt } from "../../components/pro/pro-prompt";
import { Button } from "../../components/ui/button";
import {
  ComboboxField,
  type ComboboxCopy,
} from "../../components/ui/combobox-field";
import { APP_COPY } from "../../lib/copy";
import { useEntitlement } from "../../lib/entitlement";
import {
  readPlanPage,
  vehicleCreateGate,
  type PlanPage,
} from "../../lib/pro-limits";
import {
  catalogMakes,
  isCatalogMake,
  MAKE_ALIASES,
  maxVehicleYear,
  MIN_VEHICLE_YEAR,
  modelsForMake,
  yearSuggestions,
} from "../../lib/vehicle-catalog";
import {
  createVehicle,
  listVehicles,
  type VehicleOption,
} from "../../server/scans";

export const Route = createFileRoute("/app/vehicles")({
  component: AppVehicles,
});

const v = APP_COPY.vehicles;

/** The guidance/ARIA strings the three pickers share. */
const PICKER_BASE = {
  showSuggestions: v.picker.showSuggestions,
  count: v.picker.count,
  otherOption: v.picker.otherOption,
  customNote: v.picker.customNote,
};

const MAKE_COPY: ComboboxCopy = {
  ...PICKER_BASE,
  listLabel: v.picker.make.listLabel,
  hint: v.picker.make.hint,
  listNote: v.picker.make.listNote,
  emptyMessage: v.picker.make.emptyMessage,
};

type ListState =
  | { kind: "loading" }
  | { kind: "ready"; page: PlanPage<VehicleOption> }
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
  const newest = maxVehicleYear();
  if (parsed < MIN_VEHICLE_YEAR || parsed > newest) {
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

  /* The pickers' suggestion lists. The catalog is static source, so it is read
     once; the model list follows the make the user has picked or typed (and is
     empty for a make we don't know — the field stays fully typeable). */
  const makeOptions = useMemo(() => catalogMakes(), []);
  const modelOptions = useMemo(() => modelsForMake(make), [make]);
  const yearOptions = useMemo(() => yearSuggestions(), []);

  const modelCopy = useMemo<ComboboxCopy>(
    () => ({
      ...PICKER_BASE,
      listLabel: v.picker.model.listLabel,
      hint: v.picker.model.hint,
      listNote: v.picker.model.listNote,
      /* A known make gets "no popular model matches that"; an unknown one gets
         told why the list is empty in the first place. */
      emptyMessage: isCatalogMake(make)
        ? v.picker.model.emptyMessage
        : v.picker.model.noMakeYet,
    }),
    [make],
  );

  const yearCopy = useMemo<ComboboxCopy>(
    () => ({
      listLabel: v.picker.year.listLabel,
      hint: v.picker.year.hint(MIN_VEHICLE_YEAR, maxVehicleYear()),
      listNote: v.picker.year.listNote,
      emptyMessage: v.picker.year.emptyMessage,
      showSuggestions: v.picker.showSuggestions,
      count: v.picker.count,
    }),
    [],
  );

  useEffect(() => {
    let cancelled = false;
    setState({ kind: "loading" });
    listVehicles()
      .then((page) => {
        if (!cancelled) {
          setState({ kind: "ready", page: readPlanPage<VehicleOption>(page) });
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
      // then shows exactly what was stored (nothing invented, nothing hidden),
      // and the counters below stay the server's honest ones.
      try {
        const page = await listVehicles();
        setState({ kind: "ready", page: readPlanPage<VehicleOption>(page) });
      } catch {
        setNotice(v.refreshError);
      }
    } catch (err) {
      const detail =
        err instanceof Error && err.message.trim() ? err.message.trim() : null;
      /* Two different refusals arrive here and they need different words: the
         server's free-garage-limit refusal (which says why, and which "try
         again" would contradict — the plan, not the attempt, is the limit) or
         a genuine failure (nothing was stored, retrying is right). The server's
         sentence is shown verbatim in the first case. */
      if (detail === APP_COPY.pro.vehicleLimitRefusal) {
        setSaveError(detail);
      } else {
        setSaveError(detail ? `${v.saveError} (${detail})` : v.saveError);
      }
    } finally {
      setSaving(false);
    }
  }

  const page = state.kind === "ready" ? state.page : null;
  const vehicles = page?.visible ?? [];
  /** Every vehicle the user holds — the server counts these, not this screen. */
  const total = page?.total ?? 0;
  const isEmpty = state.kind === "ready" && vehicles.length === 0;
  /* S6d: the free garage holds 1 vehicle and the SERVER enforces it — this
     screen renders the limited list it is given and asks the same gate before
     offering the form, so showing it can never be a way round the limit. */
  const entitlement = useEntitlement();
  const pro =
    entitlement.state.kind === "ready" && entitlement.state.entitlement.pro;
  const atFreeLimit = state.kind === "ready" && !pro && total > 0;
  const canAdd = vehicleCreateGate(pro, total).allowed;

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
            {/* The count is what the user HOLDS, not what fits on screen — the
                note below says how many of them are not shown here. */}
            {v.countLabel(total)}
          </h2>
          <ul className="space-y-3">
            {vehicles.map((vehicle) => (
              <VehicleRow key={vehicle.id} vehicle={vehicle} />
            ))}
          </ul>
        </>
      )}

      {/* The free garage limit, in words: what the plan keeps, and how many of
          the saved vehicles are not shown here. */}
      {atFreeLimit && page && (
        <ProUpgradePrompt
          title={APP_COPY.pro.vehicleTitle}
          description={
            page.hiddenCount > 0
              ? APP_COPY.pro.vehicleBody(page.hiddenCount)
              : APP_COPY.pro.vehicleAddNote
          }
        />
      )}

      {state.kind === "ready" && !formOpen && vehicles.length > 0 && canAdd && (
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

          <form className="mt-4 space-y-4" onSubmit={onSubmit} noValidate>
            {/* Make and model are type-to-filter pickers over a SHORT curated
                catalog (src/lib/vehicle-catalog.ts) with the full list of
                suggestions one keypress away. Neither picker restricts what can
                be saved: the input is the value, so a car that isn't in the
                list is typed and kept exactly as written. */}
            <ComboboxField
              id="vehicle-make"
              name="make"
              label={v.makeLabel}
              value={make}
              onValueChange={setMake}
              options={makeOptions}
              copy={MAKE_COPY}
              aliases={MAKE_ALIASES}
              placeholder={v.makeHint}
              error={errors.make}
              enterKeyHint="next"
            />

            <ComboboxField
              id="vehicle-model"
              name="model"
              label={v.modelLabel}
              value={model}
              onValueChange={setModel}
              options={modelOptions}
              copy={modelCopy}
              placeholder={v.modelHint}
              error={errors.model}
              enterKeyHint="next"
            />

            {/* Year: a searchable list of years, with the numeric guard in
                `parseYear` still deciding what is actually saved. */}
            <ComboboxField
              id="vehicle-year"
              name="year"
              label={v.yearLabel}
              value={year}
              onValueChange={setYear}
              options={yearOptions}
              copy={yearCopy}
              placeholder={v.yearPlaceholder}
              error={errors.year}
              inputMode="numeric"
              maxLength={4}
            />

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
