import { useState } from "react";
import { AlertIcon, CheckIcon, InfoIcon } from "../icons";
import { APP_COPY } from "../../lib/copy";
import { Button } from "../ui/button";
import { GuidedRepairPanel } from "./guided-repair-panel";
import type { RepairFamily } from "../../lib/cost";
import { latestScan } from "../../server/scans";
import {
  advanceRepairJob,
  startRepairJob,
  verifyRepairJob,
  type JobState,
  type PersistedRepairJob,
} from "../../server/repair";

/**
 * RepairJobSection — the Act + Verify flow (S5 UI).
 *
 * Wires the three repair RPCs into the scan result view:
 *   - "Start this repair" → startRepairJob({ diagnosisId }), revealing the
 *     job's steps + forward-only state (planned → in_progress → done via
 *     advanceRepairJob). No fake progress, no auto-advance.
 *   - "Verify with my latest scan" → verifyRepairJob({ jobId, scanId })
 *     against the LATEST scan on file. `{verified:true}` shows a clear
 *     success state; `{verified:false, stillPresent}` shows an honest
 *     "still present: [codes]" message and never marks verified.
 *
 * All RPC failures (not signed in, validation, transport) render a plain
 * error note — never a crash. No lock, no badge, no Pro styling anywhere.
 */

function rpcMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  return APP_COPY.decideAct.jobErrorNote;
}

export function RepairJobSection({
  scanId,
  diagnosisId,
  family,
}: {
  /** The scan this result view shows (the job's original scan). */
  scanId: string;
  /** The rules-diagnosis row id the job attaches to. */
  diagnosisId: string | null;
  family: RepairFamily | string;
}) {
  const t = APP_COPY.decideAct;
  const [job, setJob] = useState<PersistedRepairJob | null>(null);
  const [busy, setBusy] = useState<"start" | "advance" | "verify" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [stillPresent, setStillPresent] = useState<string[] | null>(null);

  async function onStart() {
    if (!diagnosisId || busy) return;
    setBusy("start");
    setError(null);
    try {
      const next = await startRepairJob({ data: { diagnosisId } });
      setJob(next);
    } catch (e) {
      setError(rpcMessage(e));
    } finally {
      setBusy(null);
    }
  }

  async function onAdvance(nextState: "in_progress" | "done") {
    if (!job || busy) return;
    setBusy("advance");
    setError(null);
    try {
      const next = await advanceRepairJob({
        data: { jobId: job.id, state: nextState satisfies JobState },
      });
      setJob(next);
    } catch (e) {
      setError(rpcMessage(e));
    } finally {
      setBusy(null);
    }
  }

  async function onVerify() {
    if (!job || busy) return;
    setBusy("verify");
    setError(null);
    setStillPresent(null);
    try {
      const latest = await latestScan();
      if (!latest) {
        setError(rpcMessage(new Error("No scans on file yet.")));
        return;
      }
      if (latest.id === scanId) {
        // The backend rejects the original scan — say so before calling.
        setError(t.verifySameScanNote);
        return;
      }
      const result = await verifyRepairJob({
        data: { jobId: job.id, scanId: latest.id },
      });
      if (result.verified) {
        setJob(result.job);
        setStillPresent(null);
      } else {
        setStillPresent(result.stillPresent);
      }
    } catch (e) {
      setError(rpcMessage(e));
    } finally {
      setBusy(null);
    }
  }

  const stateNote =
    job?.state === "in_progress"
      ? t.jobInProgressNote
      : job?.state === "done"
        ? t.jobDoneNote
        : job?.state === "verified"
          ? null
          : t.jobPlannedNote;

  return (
    <div className="space-y-4">
      {!job ? (
        <Button
          variant="primary"
          onClick={onStart}
          loading={busy === "start"}
          loadingLabel={t.startingButton}
          disabled={!diagnosisId}
        >
          {t.startButton}
        </Button>
      ) : (
        <>
          {stateNote && (
            <p className="text-sm leading-relaxed text-fg-muted">{stateNote}</p>
          )}

          {/* Forward-only state buttons — planned → in_progress → done. */}
          {job.state === "planned" && (
            <Button
              variant="primary"
              onClick={() => onAdvance("in_progress")}
              loading={busy === "advance"}
              loadingLabel={t.advancingButton}
            >
              {t.inProgressButton}
            </Button>
          )}
          {job.state === "in_progress" && (
            <Button
              variant="primary"
              onClick={() => onAdvance("done")}
              loading={busy === "advance"}
              loadingLabel={t.advancingButton}
            >
              {t.doneButton}
            </Button>
          )}

          {/* Verify — against the latest scan on file. */}
          {(job.state === "done" || job.state === "verified") && (
            <section
              aria-label={t.verifyHeading}
              className="rounded-card border border-line bg-surface p-5 shadow-sm"
            >
              <h2 className="text-sm font-bold text-fg">{t.verifyHeading}</h2>
              <p className="mt-1 text-xs leading-relaxed text-fg-subtle">
                {t.verifyDescription}
              </p>
              {job.state !== "verified" && (
                <div className="mt-3">
                  <Button
                    variant="secondary"
                    onClick={onVerify}
                    loading={busy === "verify"}
                    loadingLabel={t.verifyingButton}
                  >
                    {t.verifyButton}
                  </Button>
                </div>
              )}
              {job.state === "verified" && (
                <div
                  role="status"
                  className="mt-3 rounded-card border border-line bg-ok-fill p-4"
                >
                  <p className="flex items-start gap-2 text-sm font-bold text-ok-fg">
                    <CheckIcon
                      className="mt-0.5 h-4 w-4 shrink-0"
                      aria-hidden
                    />
                    {t.verifiedTitle}
                  </p>
                  <p className="mt-1 text-sm leading-relaxed text-ok-fg">
                    {t.verifiedBody}
                  </p>
                </div>
              )}
              {stillPresent && stillPresent.length > 0 && (
                <div
                  role="status"
                  className="mt-3 rounded-card border border-line bg-surface-sunken p-4"
                >
                  <p className="flex items-start gap-2 text-sm font-bold text-fg">
                    <InfoIcon
                      className="mt-0.5 h-4 w-4 shrink-0"
                      aria-hidden
                    />
                    {t.stillPresentTitle}: {stillPresent.join(", ")}
                  </p>
                  <p className="mt-1 text-sm leading-relaxed text-fg-muted">
                    {t.stillPresentBody}
                  </p>
                </div>
              )}
            </section>
          )}
        </>
      )}

      {error && (
        <p
          role="alert"
          className="flex items-start gap-2 rounded-card border border-line bg-surface-sunken p-3 text-sm leading-relaxed text-fg-muted"
        >
          <AlertIcon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          {error}
        </p>
      )}

      {/* The guide itself always renders — starting a job only adds the
          persisted state above; the steps are free guidance either way. */}
      <GuidedRepairPanel family={family} />
    </div>
  );
}
