import { useState } from "react";
import { AlertIcon, CheckIcon } from "../icons";
import { APP_COPY } from "../../lib/copy";
import { type RepairFamily } from "../../lib/cost";
import { REPAIR_GUIDANCE_NOTE, repairGuideFor } from "../../lib/repair";
import { CARD_MATERIAL } from "../app-shell";
import { cn } from "../../lib/cn";

/**
 * GuidedRepairPanel — the Act surface (S5 UI).
 *
 * Renders the `repairStepsFor(family)` guide: family title, the safetyNote
 * (when present) in a clearly visible safety style, then the ordered steps
 * as checkable items (checkboxes are LOCAL STATE ONLY — no persistence in
 * this slice; the persisted job state lives in `RepairJobSection`), each
 * with title, body, a tools list rendered as small chips, and estMinutes.
 * Always renders REPAIR_GUIDANCE_NOTE at the bottom.
 *
 * Honest tone throughout: the steps never promise "this will fix it" — the
 * backend library is written that way and this component preserves it.
 *
 * A7 material (motif 9, "service-procedure numbering"):
 *  - the steps hang off a VERTICAL HAIRLINE RAIL with numbered discs — the
 *    same 01…07-on-a-rail language the golden path uses — so the order is
 *    read as a procedure, not as an unordered list of tips;
 *  - the safety note sits INLINE, immediately above the first step it
 *    applies to, in the `danger` fill (these notes are real hazards — fuel
 *    vapour, a hot exhaust, a cold-engine/battery rule — so they are danger,
 *    never a passive warning banner). It is guidance, not an upsell, and it
 *    gains nothing that could read as promotion;
 *  - each checkbox has a 28px hit area inside a 48px row, and the whole row
 *    is a label, so the target is the full row width on a phone in the cold;
 *  - the tools are PLATE chips: a mono value against a hairline edge, which
 *    is the machine-data material, not a coloured pill.
 * There is no motion, no lock, no badge, no dimming anywhere in here.
 */
export function GuidedRepairPanel({
  family,
}: {
  family: RepairFamily | string;
}) {
  const t = APP_COPY.decideAct;
  const guide = repairGuideFor(family);
  const [checked, setChecked] = useState<boolean[]>(() =>
    guide.steps.map(() => false),
  );

  function toggle(index: number) {
    setChecked((prev) => prev.map((v, i) => (i === index ? !v : v)));
  }

  return (
    /* The shared card material, but as a labelled region: the panel keeps its
       `aria-label` (the <Card> helper takes no extra props). */
    <section aria-label={t.actHeading} className={cn(CARD_MATERIAL.card)}>
      <h2 className="text-sm font-bold text-fg">{t.actHeading}</h2>
      <p className="mt-1 text-base font-semibold text-fg">{guide.title}</p>

      {guide.safetyNote && (
        /* role="note" + danger fill: a real safety instruction, above the
           steps it applies to. Icon, a bold label and the words — never
           colour alone. */
        <div
          role="note"
          className="mt-3 flex items-start gap-2.5 rounded-plate border-2 border-danger-border bg-danger-fill p-3"
        >
          <AlertIcon
            className="mt-0.5 h-4 w-4 shrink-0 text-danger-fg"
            aria-hidden
          />
          <div className="min-w-0">
            <p className="text-sm font-bold text-danger-fg">{t.safetyLabel}</p>
            <p className="mt-1 text-sm leading-relaxed text-danger-fg">
              {guide.safetyNote}
            </p>
          </div>
        </div>
      )}

      <ol className="mt-4">
        {guide.steps.map((step, i) => {
          const done = checked[i] ?? false;
          const last = i === guide.steps.length - 1;
          return (
            <li key={i} className="flex gap-3">
              {/* The rail. The numbered disc carries the order (the same
                  01…07 language as the golden path); the hairline connector
                  is decorative — the <ol> is what makes the order real for a
                  screen reader, and the checkbox label repeats the step
                  number in words. */}
              <span aria-hidden className="flex w-6 shrink-0 flex-col items-center">
                <span
                  className={cn(
                    "num flex h-6 w-6 shrink-0 items-center justify-center rounded-full border font-mono text-xs font-semibold",
                    done
                      ? "border-ok-border bg-ok-fill text-ok-fg"
                      : "border-line bg-surface-sunken text-fg-muted",
                  )}
                >
                  {i + 1}
                </span>
                {!last && <span className="mt-1 w-px flex-1 bg-hairline" />}
              </span>

              <div className={cn("min-w-0 flex-1", !last && "pb-4")}>
                {/* The whole row is the target: 48px tall minimum, with a
                    28px checkbox inside it. */}
                <label className="flex min-h-12 cursor-pointer items-start gap-3">
                  <input
                    type="checkbox"
                    checked={done}
                    onChange={() => toggle(i)}
                    className="mt-0.5 h-7 w-7 shrink-0 cursor-pointer accent-brand-strong"
                    aria-label={`Step ${i + 1}: ${step.title}`}
                  />
                  <span className="min-w-0">
                    <span className="block text-sm font-bold text-fg">
                      {step.title}
                    </span>
                    <span className="mt-1 block text-sm leading-relaxed text-fg-muted">
                      {step.body}
                    </span>
                    {step.tools.length > 0 && (
                      <span className="mt-2 block">
                        <span className="label-micro block text-fg-subtle">
                          {t.toolsLabel}
                        </span>
                        {/* Tools are machine-adjacent data (A3/A7): each one
                            sits on a small plate — mono value against a
                            hairline edge — instead of a coloured pill. */}
                        <span className="mt-1.5 flex flex-wrap gap-1.5">
                          {step.tools.map((tool, j) => (
                            <span
                              key={j}
                              className="rounded-plate border border-line bg-surface-sunken px-2 py-0.5 font-mono text-xs font-semibold text-fg"
                            >
                              {tool}
                            </span>
                          ))}
                        </span>
                      </span>
                    )}
                    <span className="mt-2 flex items-center gap-1.5 text-xs font-medium text-fg-subtle">
                      {done && (
                        <CheckIcon
                          className="h-3.5 w-3.5 text-ok-fg"
                          aria-hidden
                        />
                      )}
                      ≈ {step.estMinutes} {t.minutesShort}
                    </span>
                  </span>
                </label>
              </div>
            </li>
          );
        })}
      </ol>

      <p className="mt-4 text-xs leading-relaxed text-fg-subtle">
        {REPAIR_GUIDANCE_NOTE}
      </p>
    </section>
  );
}
