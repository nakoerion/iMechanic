/**
 * A5 — the scan/connect "ignition sequence" (proposal §4, `/app/scan`).
 *
 * Two pieces of instrument, shown only while a scan is actually running:
 *
 *   - `PhaseRail` — Connect → Initialise → Read → Interpret as four ticks on a
 *     rail, so the dead seconds of a scan report what the app is doing instead
 *     of a bare sweep.
 *   - `LiveTranscript` — the last few ELM327 command → reply exchanges in mono
 *     under a `--color-tech` legend.
 *
 * The honesty rules this module exists to hold:
 *
 *   1. The rail reports a step only once the app has really reached it. The
 *      screen advances it from real events (a handshake command arriving, the
 *      read phase starting, the save-and-verdict starting) and never moves it
 *      backwards.
 *   2. The transcript renders ONLY what the adapter sent, and never as a raw
 *      dump: each exchange is one collapsed, length-capped line, and the list
 *      is capped at the last few. No synthetic "connecting…" chatter, no
 *      placeholder lines. Demo and manual scans have no adapter to transcribe,
 *      so they render no transcript at all rather than an empty box.
 *   3. Nothing here is gated, and nothing here reports a measurement.
 *
 * Decorative motion only: the live tick pulses inside `motion-safe:`.
 */

import { CheckIcon } from "../icons";
import { cn } from "../../lib/cn";
import { APP_COPY } from "../../lib/copy";
import type { ObdTranscriptEntry } from "../../obd/driver";

const t = APP_COPY.scan;

/** The approved procedure, in order (proposal §4). */
export const SCAN_STEPS = ["connect", "initialise", "read", "interpret"] as const;
export type ScanStep = (typeof SCAN_STEPS)[number];

/** Where a step sits on the rail — the screen only ever moves forward. */
export function scanStepIndex(step: ScanStep): number {
  return SCAN_STEPS.indexOf(step);
}

/**
 * The rail step an ELM327 command belongs to.
 *
 * The handshake (`ATZ` reset, `ATE0` echo off, `ATH0` headers off, and the
 * `0100` bank-detect that proves the car answers) is the **Initialise** step;
 * the four read services (`03` stored, `07` pending, `0A` permanent, `0902`
 * VIN) are the **Read** step. Anything else leaves the rail where it is rather
 * than being guessed at.
 */
export function stepForCommand(command: string): ScanStep | null {
  const cmd = command.trim().toUpperCase();
  if (cmd.startsWith("AT") || cmd === "0100") return "initialise";
  if (cmd === "03" || cmd === "07" || cmd === "0A" || cmd === "0902") {
    return "read";
  }
  return null;
}

function stepLabel(step: ScanStep): string {
  return t.steps[step];
}

/**
 * Four ticks on a rail: completed steps carry a check, the current step is
 * filled and pulses (motion-safe only), upcoming steps are a hairline tick.
 *
 * Not a telltale lamp — that motif belongs to the severity verdict alone. The
 * tick is a 3px bar, and the pending bar below 3:1 is decorative by design:
 * position on the rail and the label colour already carry the state, so it is
 * never the only signal.
 */
export function PhaseRail({ activeStep }: { activeStep: ScanStep }) {
  const activeIndex = scanStepIndex(activeStep);
  return (
    <ol aria-label={t.railLabel} className="flex items-stretch gap-2">
      {SCAN_STEPS.map((step, index) => {
        const done = index < activeIndex;
        const current = index === activeIndex;
        return (
          <li
            key={step}
            aria-current={current ? "step" : undefined}
            className="flex min-w-0 flex-1 flex-col gap-1.5"
          >
            <span
              aria-hidden="true"
              className={cn(
                "h-[3px] w-full rounded-full",
                done || current ? "bg-tech" : "bg-line",
                current && "motion-safe:animate-pulse",
              )}
            />
            <span
              className={cn(
                "flex items-center gap-1 font-mono text-[10px] font-semibold uppercase tracking-wide",
                current ? "text-fg" : done ? "text-fg-muted" : "text-fg-subtle",
              )}
            >
              {done && (
                <CheckIcon
                  aria-hidden="true"
                  className="h-3 w-3 shrink-0 text-tech"
                />
              )}
              <span className="truncate">{stepLabel(step)}</span>
            </span>
          </li>
        );
      })}
    </ol>
  );
}

/** How many exchanges the panel shows — the last few, never the whole log. */
export const TRANSCRIPT_VISIBLE_LINES = 3;
/** A single reply line is capped so a long payload can never wrap the panel. */
const MAX_REPLY_CHARS = 72;

/**
 * One adapter reply, collapsed onto a single honest line: whitespace runs
 * (the ELM327 sends CR-separated lines, and the driver reads up to and
 * including the `>` prompt) become single spaces, the closing prompt is
 * dropped because it is the adapter's turn marker rather than data, and a long
 * payload is cut with an ellipsis. An empty reply renders as a dash — the
 * transcript never invents content to fill the line.
 */
export function formatTranscriptResponse(response: string): string {
  const collapsed = response
    .replace(/\s+/g, " ")
    .trim()
    .replace(/ ?>\s*$/, "");
  if (collapsed.length === 0) return "—";
  if (collapsed.length <= MAX_REPLY_CHARS) return collapsed;
  return `${collapsed.slice(0, MAX_REPLY_CHARS - 1)}…`;
}

/**
 * The live-only transcript. Renders nothing at all when there is nothing to
 * show, which is exactly the demo and manual case (their drivers have no
 * adapter to transcribe) — so no caller has to remember to hide it.
 */
export function LiveTranscript({
  entries,
}: {
  entries: readonly ObdTranscriptEntry[];
}) {
  if (entries.length === 0) return null;
  const visible = entries.slice(-TRANSCRIPT_VISIBLE_LINES);
  return (
    <div
      /* A group, not a live region: the status line above already announces
         each phase change, and a ticking log must not re-announce itself. */
      role="group"
      aria-label={t.transcriptLabel}
      className="border-t border-hairline pt-2"
    >
      <p className="font-mono text-[10px] font-semibold uppercase tracking-wider text-tech">
        {t.transcriptLabel}
      </p>
      <ul className="mt-1 space-y-0.5 font-mono text-[11px] leading-relaxed">
        {visible.map((entry, index) => (
          <li key={`${entry.at}-${entry.command}-${index}`} className="flex gap-2">
            <span className="shrink-0 text-tech">{entry.command}</span>
            <span className="min-w-0 truncate text-fg-muted">
              {formatTranscriptResponse(entry.response)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
