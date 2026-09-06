import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Card, ScreenHeader } from "../../components/app-shell";
import {
  AlertIcon,
  CheckIcon,
  InfoIcon,
  PlugIcon,
  ScanIcon,
} from "../../components/icons";
import { Button } from "../../components/ui/button";
import { APP_COPY } from "../../lib/copy";
import { normaliseDtc } from "../../lib/dtc";
import { DemoDriver } from "../../obd/demo-simulator";
import { browserCapabilities } from "../../obd/driver";
import type { ObdScanResult } from "../../obd/driver";
import { LiveElmDriver, type LiveConnectChoice } from "../../obd/elm327-live";
import {
  createVehicle,
  getScan,
  latestScan,
  listVehicles,
  recordClear,
  saveScan,
  type PersistedScan,
  type ScanSource,
  type VehicleOption,
} from "../../server/scans";

export const Route = createFileRoute("/app/scan")({
  component: AppScan,
});

const t = APP_COPY.scan;
const statusLabel = APP_COPY.faultCode.statusLabel;

type Phase =
  | { kind: "idle" }
  | { kind: "working"; label: string }
  | { kind: "error"; message: string };

const SOURCE_BADGE: Record<ScanSource, string> = {
  demo: t.resultDemoBadge,
  manual: t.resultManualBadge,
  live: t.resultLiveBadge,
};

function vehicleName(v: VehicleOption): string {
  const name = [v.make, v.model].filter(Boolean).join(" ");
  return (name || "Unnamed car") + (v.year ? ` · ${v.year}` : "");
}

function AppScan() {
  const [lastScan, setLastScan] = useState<PersistedScan | null | "loading">(
    "loading",
  );
  const [justScannedId, setJustScannedId] = useState<string | null>(null);

  const [vehicles, setVehicles] = useState<VehicleOption[] | null>(null);
  const [vehicleId, setVehicleId] = useState<string | null>(null);
  const [make, setMake] = useState("");
  const [model, setModel] = useState("");
  const [year, setYear] = useState("");
  const [attaching, setAttaching] = useState(false);
  const [attachError, setAttachError] = useState<string | null>(null);

  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  const [manualCode, setManualCode] = useState("");
  const [manualInvalid, setManualInvalid] = useState(false);

  const [caps, setCaps] = useState<{ bluetooth: boolean; serial: boolean } | null>(
    null,
  );
  const [liveBusy, setLiveBusy] = useState<LiveConnectChoice | null>(null);

  const [cleared, setCleared] = useState(false);
  const [clearBusy, setClearBusy] = useState(false);
  const [clearError, setClearError] = useState<string | null>(null);

  // One demo driver instance per page — clearCodes() empties its simulated
  // list, and keeping the instance lets "clear" mean something in demo mode.
  const [demoDriver] = useState(() => new DemoDriver());

  async function refreshLastScan(id?: string | null) {
    try {
      const next = id ? await getScan({ data: { id } }) : await latestScan();
      setLastScan(next);
    } catch {
      setLastScan((prev) => (prev === "loading" ? null : prev));
    }
  }

  useEffect(() => {
    let cancelled = false;
    setCaps(browserCapabilities());
    refreshLastScan().catch(() => undefined);
    listVehicles()
      .then((list) => {
        if (!cancelled) setVehicles(list);
      })
      .catch(() => {
        if (!cancelled) setVehicles([]);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function persistScan(
    source: ScanSource,
    result: ObdScanResult,
  ): Promise<boolean> {
    try {
      const saved = await saveScan({
        data: {
          source,
          vehicleId,
          vin: result.vin,
          codes: result.codes.map((c) => ({
            code: c.code,
            status: c.status,
          })),
        },
      });
      setJustScannedId(saved.id);
      setCleared(false);
      setClearError(null);
      setLastScan(saved);
      return true;
    } catch {
      setPhase({ kind: "error", message: t.saveError });
      return false;
    }
  }

  async function onDemoScan() {
    setPhase({ kind: "working", label: t.demoRunning });
    try {
      demoDriver.reset();
      await demoDriver.connect();
      const result = await demoDriver.readCodes();
      const ok = await persistScan("demo", result);
      if (ok) setPhase({ kind: "idle" });
    } catch {
      setPhase({ kind: "error", message: t.saveError });
    }
  }

  async function onManualSave() {
    const normal = normaliseDtc(manualCode);
    if (!normal) {
      setManualInvalid(true);
      return;
    }
    setManualInvalid(false);
    setPhase({ kind: "working", label: t.manualSaving });
    const ok = await persistScan("manual", {
      codes: [{ code: normal, status: "stored" }],
      vin: null,
    });
    if (ok) {
      setManualCode("");
      setPhase({ kind: "idle" });
    }
  }

  async function onLiveConnect(choice: LiveConnectChoice) {
    setLiveBusy(choice);
    setPhase({ kind: "working", label: t.liveConnecting });
    const driver = new LiveElmDriver(choice);
    try {
      await driver.connect();
      setPhase({ kind: "working", label: t.liveReading });
      const result = await driver.readCodes();
      const ok = await persistScan("live", result);
      if (ok) setPhase({ kind: "idle" });
    } catch (err) {
      const detail =
        err instanceof Error ? err.message : "The connection failed.";
      const hint =
        err instanceof Error &&
        "hint" in err &&
        typeof (err as { hint?: unknown }).hint === "string"
          ? ((err as { hint?: string }).hint as string)
          : null;
      setPhase({
        kind: "error",
        message: `${t.liveErrorPrefix} ${detail}${hint ? ` ${hint}` : ""}`,
      });
    } finally {
      await driver.disconnect().catch(() => undefined);
      setLiveBusy(null);
    }
  }

  async function onAttachVehicle() {
    if (!make.trim() || !model.trim()) return;
    setAttaching(true);
    setAttachError(null);
    try {
      const parsed = year.trim() === "" ? null : Number(year.trim());
      const { id } = await createVehicle({
        data: { make: make.trim(), model: model.trim(), year: parsed },
      });
      setVehicles((prev) => [
        ...(prev ?? []),
        {
          id,
          make: make.trim(),
          model: model.trim(),
          year: Number.isInteger(parsed) ? (parsed as number) : null,
        },
      ]);
      setVehicleId(id);
      setMake("");
      setModel("");
      setYear("");
    } catch {
      setAttachError(t.saveError);
    } finally {
      setAttaching(false);
    }
  }

  async function onClear() {
    if (lastScan === null || lastScan === "loading") return;
    setClearBusy(true);
    setClearError(null);
    try {
      // Drive the adapter too where there is one to drive: the demo driver's
      // simulated list, or a live adapter when the browser supports one.
      // Manual scans have no car attached — the server record is the clear.
      if (lastScan.source === "demo") {
        await demoDriver.connect().catch(() => undefined);
        await demoDriver.clearCodes();
      }
      await recordClear({ data: { id: lastScan.id } });
      setCleared(true);
    } catch {
      setClearError(t.clearError);
    } finally {
      setClearBusy(false);
    }
  }

  const liveUnavailable =
    caps !== null && !caps.bluetooth && !caps.serial;

  return (
    <div className="space-y-6">
      <ScreenHeader title={t.title} description={t.description} />

      {phase.kind === "error" && (
        <p
          role="alert"
          className="flex items-start gap-2 rounded-card border border-danger-border bg-danger-fill p-4 text-sm leading-relaxed text-danger-fg"
        >
          <AlertIcon className="mt-0.5 h-4 w-4 shrink-0" />
          {phase.message}
        </p>
      )}

      {/* Last scan result — the payoff of the screen. */}
      {lastScan === "loading" ? (
        <p className="text-sm text-fg-muted">Loading…</p>
      ) : lastScan ? (
        <ScanResult
          scan={lastScan}
          fresh={justScannedId === lastScan.id}
          cleared={cleared}
          clearBusy={clearBusy}
          clearError={clearError}
          onClear={() => void onClear()}
          onNewScan={() => {
            setJustScannedId(null);
            setCleared(false);
            setClearError(null);
            setPhase({ kind: "idle" });
            void refreshLastScan();
          }}
        />
      ) : (
        <>
          <VehiclePicker
            vehicles={vehicles}
            vehicleId={vehicleId}
            onSelect={setVehicleId}
            make={make}
            model={model}
            year={year}
            onMake={setMake}
            onModel={setModel}
            onYear={setYear}
            attaching={attaching}
            attachError={attachError}
            onAttach={() => void onAttachVehicle()}
          />

          {/* Live adapter */}
          <Card>
            <h2 className="flex items-center gap-2 text-sm font-bold text-fg">
              <PlugIcon className="h-4 w-4 text-brand-strong" />
              {t.liveHeading}
            </h2>
            <p className="mt-1 text-xs leading-relaxed text-fg-subtle">
              {t.liveDescription}
            </p>
            {liveUnavailable ? (
              <div className="mt-3 rounded-card border border-line bg-surface-sunken p-4">
                <p className="flex items-start gap-2 text-sm font-semibold text-fg">
                  <InfoIcon className="mt-0.5 h-4 w-4 shrink-0 text-brand-strong" />
                  {t.liveUnavailableTitle}
                </p>
                <p className="mt-1 text-xs leading-relaxed text-fg-muted">
                  {t.liveUnavailableDescription}
                </p>
              </div>
            ) : (
              <div className="mt-3 grid gap-2">
                {caps?.bluetooth && (
                  <Button
                    variant="secondary"
                    fullWidth
                    loading={liveBusy === "bluetooth"}
                    loadingLabel={t.liveConnecting}
                    onClick={() => void onLiveConnect("bluetooth")}
                  >
                    {t.liveConnectBluetooth}
                  </Button>
                )}
                {caps?.serial && (
                  <Button
                    variant="secondary"
                    fullWidth
                    loading={liveBusy === "serial"}
                    loadingLabel={t.liveConnecting}
                    onClick={() => void onLiveConnect("serial")}
                  >
                    {t.liveConnectSerial}
                  </Button>
                )}
              </div>
            )}
          </Card>

          {/* Demo */}
          <Card>
            <h2 className="flex items-center gap-2 text-sm font-bold text-fg">
              <ScanIcon className="h-4 w-4 text-brand-strong" />
              {t.demoHeading}
            </h2>
            <p className="mt-1 text-xs leading-relaxed text-fg-subtle">
              {t.demoDescription}
            </p>
            <p className="mt-1 text-xs leading-relaxed text-fg-subtle">
              {t.demoDatasetNote}
            </p>
            <Button
              className="mt-3"
              fullWidth
              loading={
                phase.kind === "working" && phase.label === t.demoRunning
              }
              loadingLabel={t.demoRunning}
              onClick={() => void onDemoScan()}
            >
              {t.demoButton}
            </Button>
          </Card>

          {/* Manual */}
          <Card>
            <h2 className="text-sm font-bold text-fg">{t.manualHeading}</h2>
            <p className="mt-1 text-xs leading-relaxed text-fg-subtle">
              {t.manualDescription}
            </p>
            <form
              className="mt-3 space-y-2"
              onSubmit={(e) => {
                e.preventDefault();
                void onManualSave();
              }}
            >
              <label
                htmlFor="manual-code"
                className="block text-xs font-semibold text-fg"
              >
                {t.manualLabelInput}
              </label>
              <input
                id="manual-code"
                value={manualCode}
                onChange={(e) => {
                  setManualCode(e.target.value);
                  setManualInvalid(false);
                }}
                placeholder="P0420"
                autoComplete="off"
                spellCheck={false}
                aria-invalid={manualInvalid || undefined}
                aria-describedby={
                  manualInvalid ? "manual-code-error" : "manual-code-hint"
                }
                className="h-12 w-full rounded-control border-2 border-line-strong bg-surface px-3 font-mono text-base uppercase tracking-wider text-fg placeholder:text-fg-subtle focus:border-brand focus:outline-none"
              />
              {manualInvalid ? (
                <p
                  id="manual-code-error"
                  role="alert"
                  className="text-xs font-medium text-danger-fg"
                >
                  {t.manualInvalid}
                </p>
              ) : (
                <p id="manual-code-hint" className="text-xs text-fg-subtle">
                  {t.manualHint}
                </p>
              )}
              <Button
                type="submit"
                variant="secondary"
                fullWidth
                loading={
                  phase.kind === "working" && phase.label === t.manualSaving
                }
                loadingLabel={t.manualSaving}
              >
                {t.manualButton}
              </Button>
            </form>
          </Card>
        </>
      )}
    </div>
  );
}

function VehiclePicker({
  vehicles,
  vehicleId,
  onSelect,
  make,
  model,
  year,
  onMake,
  onModel,
  onYear,
  attaching,
  attachError,
  onAttach,
}: {
  vehicles: VehicleOption[] | null;
  vehicleId: string | null;
  onSelect: (id: string | null) => void;
  make: string;
  model: string;
  year: string;
  onMake: (v: string) => void;
  onModel: (v: string) => void;
  onYear: (v: string) => void;
  attaching: boolean;
  attachError: string | null;
  onAttach: () => void;
}) {
  return (
    <Card>
      <h2 className="text-sm font-bold text-fg">{t.vehicleHeading}</h2>
      {vehicles === null ? (
        <p className="mt-1 text-xs text-fg-subtle">Loading…</p>
      ) : vehicles.length > 0 ? (
        <div
          className="mt-3 flex flex-wrap gap-2"
          role="radiogroup"
          aria-label={t.vehicleExistingLabel}
        >
          <button
            type="button"
            role="radio"
            aria-checked={vehicleId === null}
            onClick={() => onSelect(null)}
            className={
              vehicleId === null
                ? "rounded-full bg-brand px-3 py-1.5 text-xs font-semibold text-on-brand"
                : "rounded-full bg-neutral-fill px-3 py-1.5 text-xs font-semibold text-neutral-fg hover:bg-surface-sunken"
            }
          >
            {t.vehicleNone}
          </button>
          {vehicles.map((v) => (
            <button
              key={v.id}
              type="button"
              role="radio"
              aria-checked={vehicleId === v.id}
              onClick={() => onSelect(v.id)}
              className={
                vehicleId === v.id
                  ? "rounded-full bg-brand px-3 py-1.5 text-xs font-semibold text-on-brand"
                  : "rounded-full bg-neutral-fill px-3 py-1.5 text-xs font-semibold text-neutral-fg hover:bg-surface-sunken"
              }
            >
              {vehicleName(v)}
            </button>
          ))}
        </div>
      ) : (
        <p className="mt-1 text-xs leading-relaxed text-fg-subtle">
          {t.vehicleNone}
        </p>
      )}
      <div className="mt-4 grid grid-cols-2 gap-2">
        <div>
          <label htmlFor="scan-make" className="block text-xs font-semibold text-fg">
            {t.vehicleNewMakeLabel}
          </label>
          <input
            id="scan-make"
            value={make}
            onChange={(e) => onMake(e.target.value)}
            placeholder={t.vehicleNewMakeHint}
            autoComplete="off"
            className="mt-1 h-12 w-full rounded-control border-2 border-line-strong bg-surface px-3 text-base text-fg placeholder:text-fg-subtle focus:border-brand focus:outline-none"
          />
        </div>
        <div>
          <label htmlFor="scan-model" className="block text-xs font-semibold text-fg">
            {t.vehicleNewModelLabel}
          </label>
          <input
            id="scan-model"
            value={model}
            onChange={(e) => onModel(e.target.value)}
            placeholder={t.vehicleNewModelHint}
            autoComplete="off"
            className="mt-1 h-12 w-full rounded-control border-2 border-line-strong bg-surface px-3 text-base text-fg placeholder:text-fg-subtle focus:border-brand focus:outline-none"
          />
        </div>
      </div>
      <div className="mt-2">
        <label htmlFor="scan-year" className="block text-xs font-semibold text-fg">
          {t.vehicleNewYearLabel}
        </label>
        <input
          id="scan-year"
          value={year}
          onChange={(e) => onYear(e.target.value)}
          inputMode="numeric"
          autoComplete="off"
          className="mt-1 h-12 w-full rounded-control border-2 border-line-strong bg-surface px-3 text-base text-fg placeholder:text-fg-subtle focus:border-brand focus:outline-none"
        />
      </div>
      {attachError && (
        <p role="alert" className="mt-2 text-xs font-medium text-danger-fg">
          {attachError}
        </p>
      )}
      <Button
        variant="ghost"
        size="sm"
        className="mt-2"
        loading={attaching}
        loadingLabel={t.vehicleAttaching}
        disabled={!make.trim() || !model.trim()}
        onClick={onAttach}
      >
        {t.vehicleAttachNew}
      </Button>
    </Card>
  );
}

function ScanResult({
  scan,
  fresh,
  cleared,
  clearBusy,
  clearError,
  onClear,
  onNewScan,
}: {
  scan: PersistedScan;
  fresh: boolean;
  cleared: boolean;
  clearBusy: boolean;
  clearError: string | null;
  onClear: () => void;
  onNewScan: () => void;
}) {
  return (
    <div className="space-y-6">
      <section className="rounded-card border border-line bg-surface p-5 shadow-sm">
        <h2 className="text-sm font-bold text-fg">{t.resultHeading}</h2>
        {/* Source badge: demo data is never presented as real. */}
        <p className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-neutral-fill px-3 py-1 text-xs font-semibold text-neutral-fg">
          {scan.source === "demo" && (
            <InfoIcon className="h-3.5 w-3.5" aria-hidden />
          )}
          {SOURCE_BADGE[scan.source]}
        </p>
        {fresh && (
          <p className="mt-1 flex items-center gap-1.5 text-xs font-medium text-ok-fg">
            <CheckIcon className="h-3.5 w-3.5" aria-hidden />
            {t.resultSavedNote}
          </p>
        )}
        {scan.vin && (
          <p className="mt-2 text-xs text-fg-subtle">
            {t.resultVinLabel}:{" "}
            <span className="font-mono font-semibold text-fg">{scan.vin}</span>
          </p>
        )}
        {scan.codes.length === 0 ? (
          <p className="mt-3 text-sm leading-relaxed text-fg-muted">
            {t.resultEmpty}
          </p>
        ) : (
          <ul className="mt-3 space-y-2">
            {scan.codes.map((c) => (
              <li
                key={c.id}
                className="rounded-card border border-line bg-surface-sunken p-3"
              >
                <div className="flex items-baseline justify-between gap-2">
                  <span className="font-mono text-base font-bold tracking-wider text-fg">
                    {c.code}
                  </span>
                  <span className="rounded-full bg-neutral-fill px-2.5 py-0.5 text-xs font-semibold text-neutral-fg">
                    {statusLabel[c.status] ?? c.status}
                  </span>
                </div>
                {/* No invented definitions: the catalog is empty until S4. */}
                <p className="mt-1 text-xs leading-relaxed text-fg-subtle">
                  {APP_COPY.faultCode.meaningPendingNote}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Clear codes — free forever. No lock, no badge, no dimming. */}
      <section className="rounded-card border border-line bg-surface p-5 shadow-sm">
        <h2 className="text-sm font-bold text-fg">{t.clearButton}</h2>
        <p className="mt-1 text-xs leading-relaxed text-fg-subtle">
          {t.clearConfirm}
        </p>
        {scan.source === "demo" && (
          <p className="mt-1 text-xs leading-relaxed text-fg-subtle">
            {t.clearDemoNote}
          </p>
        )}
        {scan.source === "manual" && (
          <p className="mt-1 text-xs leading-relaxed text-fg-subtle">
            {t.clearManualNote}
          </p>
        )}
        <p className="mt-2 flex items-center gap-1.5 text-xs font-semibold text-ok-fg">
          <CheckIcon className="h-3.5 w-3.5" aria-hidden />
          {t.clearFreeNote}
        </p>
        {cleared ? (
          <p
            role="status"
            className="mt-3 flex items-start gap-2 text-sm leading-relaxed text-fg"
          >
            <CheckIcon className="mt-0.5 h-4 w-4 shrink-0 text-ok-fg" aria-hidden />
            {t.cleared}
          </p>
        ) : (
          <Button
            variant="secondary"
            fullWidth
            className="mt-3"
            loading={clearBusy}
            loadingLabel={t.clearing}
            onClick={onClear}
          >
            {t.clearButton}
          </Button>
        )}
        {clearError && (
          <p role="alert" className="mt-2 text-xs font-medium text-danger-fg">
            {clearError}
          </p>
        )}
      </section>

      <Button variant="ghost" fullWidth onClick={onNewScan}>
        {t.newScanButton}
      </Button>
    </div>
  );
}
