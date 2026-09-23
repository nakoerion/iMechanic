import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Card, ScreenHeader } from "../../components/app-shell";
import {
  AdapterIcon,
  AlertIcon,
  BluetoothIcon,
  CheckIcon,
  InfoIcon,
  ObdPortIcon,
  ScanIcon,
  SweepIcon,
} from "../../components/icons";
import { FaultCodeCard } from "../../components/severity/fault-code-card";
import {
  LiveTranscript,
  PhaseRail,
  scanStepIndex,
  stepForCommand,
  type ScanStep,
} from "../../components/scan/ignition-sequence";
import { AiRootCausePanel } from "../../components/severity/ai-root-cause-panel";
import { VerdictPanel } from "../../components/severity/verdict-panel";
import { CostDecisionCard } from "../../components/decide/cost-decision-card";
import { RepairJobSection } from "../../components/repair/repair-job-section";
import { ProGate } from "../../components/pro/pro-gate";
import { ProUpgradePrompt } from "../../components/pro/pro-prompt";
import { Button } from "../../components/ui/button";
import { APP_COPY } from "../../lib/copy";
import { normaliseDtc } from "../../lib/dtc";
import { useEntitlement, type EntitlementHandle } from "../../lib/entitlement";
import {
  readPlanPage,
  vehicleCreateGate,
  type PlanPage,
} from "../../lib/pro-limits";
import type { Severity } from "../../lib/severity";
import { DemoDriver } from "../../obd/demo-simulator";
import { browserCapabilities } from "../../obd/driver";
import type { ObdCapabilities, ObdScanResult, ObdTranscriptEntry } from "../../obd/driver";
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
  /* A5: `step` is the ignition-sequence rail position. It is null when there
     is no adapter procedure to report — manual entry is a save, not a scan, so
     it shows the status line alone. */
  | { kind: "working"; label: string; step: ScanStep | null }
  | { kind: "error"; message: string };

/* How many transcript exchanges the screen keeps in state. The panel renders
   the last few of them; nothing here is persisted (raw_json stays the driver's
   own full log). */
const TRANSCRIPT_BUFFER = 6;

/* How long each ignition-sequence step is held on the demo path. The demo
   driver answers in microtasks, so without a pause the rail's four steps run
   inside one frame: the sequence is invisible without hardware and
   "Initialise" never appears as the active step at all. The live-hardware path
   keeps stepping on real adapter events and is deliberately NOT paced. */
const DEMO_STEP_MS = 450;

/** True when the visitor asked the OS for stillness. */
function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

/** Hold a demo step long enough to be seen — never for reduced-motion users. */
function holdDemoStep(ms = DEMO_STEP_MS): Promise<void> {
  if (prefersReducedMotion()) return Promise.resolve();
  return new Promise((resolve) => setTimeout(resolve, ms));
}

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
  /* One entitlement lookup per screen, shared by every gate below (S6b). */
  const entitlement = useEntitlement();
  const pro = entitlement.state.kind === "ready" && entitlement.state.entitlement.pro;

  /* S6d: the garage arrives as a plan-limited page (free keeps 1 vehicle, Pro
     keeps all) — the server decides what this screen may see. null = loading. */
  const [garage, setGarage] = useState<PlanPage<VehicleOption> | null>(null);
  const [vehicleId, setVehicleId] = useState<string | null>(null);
  const [make, setMake] = useState("");
  const [model, setModel] = useState("");
  const [year, setYear] = useState("");
  const [attaching, setAttaching] = useState(false);
  const [attachError, setAttachError] = useState<string | null>(null);

  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  /* A5: the live adapter conversation as it arrives, from the driver's
     observer. Empty for demo and manual runs — and therefore no transcript
     block. */
  const [transcript, setTranscript] = useState<ObdTranscriptEntry[]>([]);
  const [manualCode, setManualCode] = useState("");
  const [manualInvalid, setManualInvalid] = useState(false);

  const [caps, setCaps] = useState<ObdCapabilities | null>(null);
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
      .then((page) => {
        if (!cancelled) setGarage(readPlanPage<VehicleOption>(page));
      })
      .catch(() => {
        // An unreadable garage reads as an empty one, never as an error: the
        // scan itself does not depend on a vehicle being attached.
        if (!cancelled) setGarage(readPlanPage<VehicleOption>(undefined));
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
          // R3 persistence: live scans carry the session transcript into
          // raw_json. Demo/manual have none. The transcript is persisted
          // data only — the UI never renders it as a raw dump.
          transcript: source === "live" ? (result.transcript ?? null) : null,
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
    setTranscript([]);
    /* The demo adapter's connect() IS its simulated handshake
       (`demo-simulator.ts`: "Simulated handshake: no transport, nothing to
       fail"), so Initialise is complete the moment it returns. The label stays
       "Reading demo codes…" throughout — the demo button's own loading state
       keys off this exact label. Each step is held briefly so the rail is
       observably walked (see DEMO_STEP_MS). */
    const showStep = async (step: ScanStep) => {
      setPhase({ kind: "working", label: t.demoRunning, step });
      await holdDemoStep();
    };
    try {
      // NOTE: no demoDriver.reset() here. A cleared demo adapter must READ
      // EMPTY on the next demo scan — that is the re-scan-verify flow QA
      // checks ("clear codes, then re-scan → honest empty state"). reset()
      // is only used by tests and by the S5 verify flow when the demo car's
      // faults are deliberately restored.
      await showStep("connect");
      await demoDriver.connect();
      await showStep("initialise");
      await showStep("read");
      const result = await demoDriver.readCodes();
      await showStep("interpret");
      const ok = await persistScan("demo", result);
      if (ok) setPhase({ kind: "idle" });
    } catch {
      setPhase({ kind: "error", message: t.saveError });
    }
  }

  async function onManualSave() {
    // Manual entry accepts one or several codes ("P0301 P0420", comma or
    // space separated) so the acceptance pair can be typed in together.
    const parts = manualCode.split(/[\s,;]+/).filter((p) => p.length > 0);
    const normals = parts.map((p) => normaliseDtc(p));
    if (normals.length === 0 || normals.some((n) => n === null)) {
      setManualInvalid(true);
      return;
    }
    setManualInvalid(false);
    /* A5: no rail — a typed code is saved, not read off a car, so there is no
       adapter procedure to report. */
    setPhase({ kind: "working", label: t.manualSaving, step: null });
    const ok = await persistScan("manual", {
      codes: (normals as string[]).map((code) => ({
        code,
        status: "stored" as const,
      })),
      vin: null,
    });
    if (ok) {
      setManualCode("");
      setPhase({ kind: "idle" });
    }
  }

  async function onLiveConnect(choice: LiveConnectChoice) {
    setLiveBusy(choice);
    setTranscript([]);
    setPhase({ kind: "working", label: t.liveConnecting, step: "connect" });
    const driver = new LiveElmDriver(choice);
    /* A5: watch the adapter conversation while it happens. The observer only
       ever APPENDS what the driver logged, and it advances the rail from real
       commands — the ELM327 handshake is Initialise, the read services are
       Read — so the rail can never show a step the app has not reached. */
    const unsubscribe = driver.onTranscriptEntry((entry) => {
      setTranscript((prev) => [...prev, entry].slice(-TRANSCRIPT_BUFFER));
      const next = stepForCommand(entry.command);
      if (!next) return;
      setPhase((prev) =>
        prev.kind === "working" &&
        prev.step !== null &&
        scanStepIndex(next) > scanStepIndex(prev.step)
          ? { ...prev, step: next }
          : prev,
      );
    });
    try {
      await driver.connect();
      setPhase({ kind: "working", label: t.liveReading, step: "read" });
      const result = await driver.readCodes();
      /* The last rail step: the codes are in and the app is running the
         fault-code rulebook over them as the scan is saved. */
      setPhase({ kind: "working", label: t.interpreting, step: "interpret" });
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
      unsubscribe();
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
      /* Show what was just stored without re-asking the server: the row is
         appended to the page we hold. The counters stay honest — the new row
         is one more than the server last told us the user holds. */
      setGarage((prev) => {
        const page = prev ?? readPlanPage<VehicleOption>(undefined);
        const added: VehicleOption = {
          id,
          make: make.trim(),
          model: model.trim(),
          year: Number.isInteger(parsed) ? (parsed as number) : null,
        };
        return {
          visible: [...page.visible, added],
          hiddenCount: page.hiddenCount,
          limited: page.hiddenCount > 0,
          total: page.total + 1,
        };
      });
      setVehicleId(id);
      setMake("");
      setModel("");
      setYear("");
    } catch (err) {
      /* The server refuses the free plan's second vehicle with a sentence that
         says why; show it verbatim rather than replacing it with "try again",
         which is the one thing that cannot help. */
      const detail =
        err instanceof Error && err.message.trim() ? err.message.trim() : null;
      setAttachError(
        detail === APP_COPY.pro.vehicleLimitRefusal ? detail : t.saveError,
      );
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
    caps !== null && !caps.bluetooth && !caps.serial && !caps.native;

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
      {/* Working state (connecting / reading codes). A4: the tach sweep is the
          progress motif, and it reports that a procedure is running — never a
          measurement — so it sits beside the status label and never next to a
          number. The label is the same copy the buttons already use.
          A5: the dead seconds become an ignition sequence — the four-step rail
          plus, on a live scan only, the adapter conversation ticking in mono.
          The rail is absent for manual entry (there is no adapter procedure to
          report) and the transcript is absent unless the adapter actually said
          something, so neither can ever be decorative filler. */}
      {phase.kind === "working" && (
        /* A technical-block material (A6): the ignition rail + adapter
           transcript is machine data, so it sits on a PLATE — the tighter
           radius and denser interior of `--radius-plate` — not on a card. */
        <div className="space-y-2.5 rounded-plate border border-line bg-surface-sunken px-3 py-3">
          {phase.step && <PhaseRail activeStep={phase.step} />}
          <p
            role="status"
            className="flex items-center gap-2 text-sm font-semibold text-fg"
          >
            <SweepIcon className="h-5 w-5 shrink-0 text-brand-strong motion-safe:animate-spin" />
            {phase.label}
          </p>
          {liveBusy !== null && transcript.length > 0 && (
            <LiveTranscript entries={transcript} />
          )}
        </div>
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
          entitlement={entitlement}
          onClear={() => void onClear()}
          onNewScan={() => {
            // QA: "Start a new scan" must return to the fresh entry form.
            // Simply re-reading latest() would re-fetch the SAME just-saved
            // scan and keep the result view stuck — dropping the last result
            // is what "new scan" means here (the result stays in history).
            setJustScannedId(null);
            setCleared(false);
            setClearError(null);
            setPhase({ kind: "idle" });
            setLastScan(null);
          }}
        />
      ) : (
        <>
          <VehiclePicker
            garage={garage}
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
            /* S6d: the server is the boundary. This asks the same gate it does,
               against the count it reported, so the form is only offered when
               the server would actually accept the vehicle — never a form that
               is filled in and then refused. */
            showAddForm={vehicleCreateGate(pro, garage?.total ?? 0).allowed}
          />

          {/* Demo — the primary free onboarding path. Placed BEFORE the live
              adapter card so "Run demo scan" sits fully above the bottom tab
              bar at initial scroll: QA found that with it at the page bottom
              its centre landed under the fixed tab bar at 390×844 and taps
              misrouted to the Vehicle tab. Demo must be immediately tappable. */}
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

          {/* Live adapter.
              A4: the OBD2 socket and the dongle carry the imagery — the port
              under the dash in the heading, the dongle on the USB button and
              the Bluetooth mark on the wireless ones, so which link is which
              is legible before the label is read. */}
          <Card>
            <h2 className="flex items-center gap-2 text-sm font-bold text-fg">
              <ObdPortIcon className="h-4 w-4 text-brand-strong" />
              {t.liveHeading}
            </h2>
            <p className="mt-1 text-xs leading-relaxed text-fg-subtle">
              {t.liveDescription}
            </p>
            {liveUnavailable ? (
              <div className="mt-3 rounded-plate border border-line bg-surface-sunken p-4">
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
                {caps?.native && (
                  <>
                    {/* The app's own bridge (S7). On iPhone this is the only
                        live transport there is — iOS Safari has no Web
                        Bluetooth — so it is offered first and explained
                        rather than presented as a mysterious extra button. */}
                    <Button
                      variant="secondary"
                      fullWidth
                      leadingIcon={<BluetoothIcon className="h-4 w-4" />}
                      loading={liveBusy === "native"}
                      loadingLabel={t.liveConnecting}
                      onClick={() => void onLiveConnect("native")}
                    >
                      {t.liveConnectNative}
                    </Button>
                    <p className="text-xs leading-relaxed text-fg-subtle">
                      {t.liveNativeNote}
                    </p>
                  </>
                )}
                {caps?.bluetooth && (
                  <Button
                    variant="secondary"
                    fullWidth
                    leadingIcon={<BluetoothIcon className="h-4 w-4" />}
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
                    leadingIcon={<AdapterIcon className="h-4 w-4" />}
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
  garage,
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
  showAddForm,
}: {
  /**
   * The plan-limited garage page from the server (S6d): `visible` is what this
   * plan may attach to, `hiddenCount`/`total` are the honest counts behind it.
   * null while the first read is in flight.
   */
  garage: PlanPage<VehicleOption> | null;
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
  /** False when the server would refuse another vehicle for this plan. */
  showAddForm: boolean;
}) {
  const list = garage?.visible ?? [];
  return (
    <Card>
      <h2 className="text-sm font-bold text-fg">{t.vehicleHeading}</h2>
      {garage === null ? (
        <p className="mt-1 text-xs text-fg-subtle">Loading…</p>
      ) : list.length > 0 ? (
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
          {list.map((v) => (
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

      {/* The garage limit, said out loud — never a silently shorter list. Only
          a free user's page ever carries a hidden count (the server limits
          nobody else), so this needs no plan check of its own. */}
      {garage !== null && garage.hiddenCount > 0 && (
        <ProUpgradePrompt
          compact
          className="mt-3"
          title={APP_COPY.pro.vehicleTitle}
          description={APP_COPY.pro.vehicleBody(garage.hiddenCount)}
        />
      )}

      {showAddForm ? (
        <>
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
        </>
      ) : (
        <p className="mt-3 text-xs leading-relaxed text-fg-subtle">
          {APP_COPY.pro.vehicleAddNote}
        </p>
      )}
    </Card>
  );
}

function ScanResult({
  scan,
  fresh,
  cleared,
  clearBusy,
  clearError,
  entitlement,
  onClear,
  onNewScan,
}: {
  scan: PersistedScan;
  fresh: boolean;
  cleared: boolean;
  clearBusy: boolean;
  clearError: string | null;
  /** Entitlement for the Pro gates (AI, Decide/Act) — the free surfaces above
   *  and below them never depend on it. */
  entitlement: EntitlementHandle;
  onClear: () => void;
  onNewScan: () => void;
}) {
  return (
    <div className="space-y-6">
      {/* FREE verdict — rendered ABOVE the codes list. Rules-engine verdict,
          never gated: no lock, no badge, no blur, no dimming (AGENTS.md). */}
      {scan.diagnosis ? (
        <div>
          <VerdictPanel
            severity={scan.diagnosis.verdict as Severity}
            summary={scan.diagnosis.summary}
            source="rules"
            codeCount={scan.codes.length}
          />
          <div className="mt-2 rounded-card border border-line bg-surface p-4 shadow-card">
            <p className="text-xs font-semibold uppercase tracking-wider text-fg-subtle">
              {APP_COPY.faultCode.diagnosisReasonsLabel}
            </p>
            <ul className="mt-1.5 space-y-1.5">
              {scan.diagnosis.reasons.map((reason, i) => (
                <li
                  key={i}
                  className="text-sm leading-relaxed text-fg-muted"
                >
                  {reason}
                </li>
              ))}
            </ul>
          </div>
        </div>
      ) : (
        <p className="rounded-card border border-line bg-surface p-4 text-xs leading-relaxed text-fg-subtle shadow-card">
          {APP_COPY.faultCode.verdictMismatchNote}
        </p>
      )}

      {/* PRO AI root cause (S4 UI) — BELOW the free verdict + reasons, BEFORE
          the fault-codes list. Gated in S6b: a Pro user sees the panel exactly
          as before; a free user sees the explicit Pro card in its place. The
          free VerdictPanel above is untouched — never blurred, dimmed or
          badged. */}
      <ProGate
        entitlement={entitlement}
        title={APP_COPY.pro.aiTitle}
        description={APP_COPY.pro.aiBody}
      >
        <AiRootCausePanel scanId={scan.id} initial={scan.aiDiagnosis} />
      </ProGate>

      {/* S5 Decide + Act + Verify — Pro since S6b, and gated as ONE block: they
          are the same "plan the repair" step of the golden path (cost band →
          guided steps → re-scan verification), so a free user gets one clear
          Pro card here rather than three near-identical ones. Still BELOW the
          free verdict and code cards in the layout. */}
      {scan.diagnosis && (
        <ProGate
          entitlement={entitlement}
          title={APP_COPY.pro.repairTitle}
          description={APP_COPY.pro.repairBody}
        >
          <CostDecisionCard
            family={scan.diagnosis.repairFamily}
            currency={scan.diagnosis.currency}
            diyLowCents={scan.diagnosis.diyLowCents}
            diyHighCents={scan.diagnosis.diyHighCents}
            shopLowCents={scan.diagnosis.shopLowCents}
            shopHighCents={scan.diagnosis.shopHighCents}
            workshopRecommended={scan.diagnosis.workshopRecommended}
          />
          <RepairJobSection
            scanId={scan.id}
            diagnosisId={scan.diagnosis.id}
            family={scan.diagnosis.repairFamily}
          />
        </ProGate>
      )}

      <section className="rounded-card border border-line bg-surface p-5 shadow-card">
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
          <ul className="mt-3 space-y-3">
            {scan.codeDetails.length > 0
              ? scan.codeDetails.map((c) =>
                  c.known ? (
                    <li key={c.id}>
                      <FaultCodeCard
                        code={c.code}
                        title={c.title ?? c.code}
                        severity={c.severity as Severity}
                        genericCause={c.genericCause ?? undefined}
                        system={c.system ?? undefined}
                        status={c.status}
                      />
                    </li>
                  ) : (
                    <li
                      key={c.id}
                      className="rounded-plate border border-line bg-surface-sunken p-3"
                    >
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="font-mono text-base font-bold tracking-wider text-fg">
                          {c.code}
                        </span>
                        <span className="rounded-full bg-neutral-fill px-2.5 py-0.5 text-xs font-semibold text-neutral-fg">
                          {statusLabel[c.status] ?? c.status}
                        </span>
                      </div>
                      {/* Honest fallback: never invent a meaning. */}
                      <p className="mt-1 text-xs leading-relaxed text-fg-subtle">
                        {APP_COPY.faultCode.notInCatalogNote}
                      </p>
                    </li>
                  ),
                )
              : scan.codes.map((c) => (
                  <li
                    key={c.id}
                    className="rounded-plate border border-line bg-surface-sunken p-3"
                  >
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="font-mono text-base font-bold tracking-wider text-fg">
                        {c.code}
                      </span>
                      <span className="rounded-full bg-neutral-fill px-2.5 py-0.5 text-xs font-semibold text-neutral-fg">
                        {statusLabel[c.status] ?? c.status}
                      </span>
                    </div>
                    <p className="mt-1 text-xs leading-relaxed text-fg-subtle">
                      {APP_COPY.faultCode.notInCatalogNote}
                    </p>
                  </li>
                ))}
          </ul>
        )}
      </section>

      {/* Clear codes — free forever. No lock, no badge, no dimming. */}
      <section className="rounded-card border border-line bg-surface p-5 shadow-card">
        <h2 className="text-sm font-bold text-fg">{t.clearButton}</h2>
        <p className="mt-1 text-xs leading-relaxed text-fg-subtle">
          {t.clearConfirm}
        </p>
        {/* R4 safety honesty — free surface, no lock, no badge. Both warnings
            show whenever the clear confirmation shows. */}
        <p className="mt-1 text-xs leading-relaxed text-fg-subtle">
          {t.clearHidesNote}
        </p>
        <p className="mt-1 text-xs leading-relaxed text-fg-subtle">
          {t.clearReadinessNote}
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
