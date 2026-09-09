import { useState } from "react";
import { AlertIcon, CheckIcon } from "../icons";
import { APP_COPY } from "../../lib/copy";
import {
  REPAIR_GUIDANCE_NOTE,
  repairGuideFor,
  type RepairFamily,
} from "../../lib/repair";

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
    <section
      aria-label={t.actHeading}
      className="rounded-card border border-line bg-surface p-5 shadow-sm"
    >
      <h2 className="text-sm font-bold text-fg">{t.actHeading}</h2>
      <p className="mt-1 text-base font-semibold text-fg">{guide.title}</p>

      {guide.safetyNote && (
        <div
          role="note"
          className="mt-3 rounded-card border-2 border-danger bg-danger-fill p-4"
        >
          <p className="flex items-start gap-2 text-sm font-bold text-danger-fg">
            <AlertIcon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            {t.safetyLabel}
          </p>
          <p className="mt-1 text-sm leading-relaxed text-danger-fg">
            {guide.safetyNote}
          </p>
        </div>
      )}

      <ol className="mt-4 space-y-3">
        {guide.steps.map((step, i) => {
          const done = checked[i] ?? false;
          return (
            <li
              key={i}
              className="rounded-card border border-line bg-surface-sunken p-4"
            >
              <label className="flex cursor-pointer items-start gap-3">
                <input
                  type="checkbox"
                  checked={done}
                  onChange={() => toggle(i)}
                  className="mt-1 h-5 w-5 shrink-0 accent-[#d97706]"
                  aria-label={`Step ${i + 1}: ${step.title}`}
                />
                <span className="min-w-0">
                  <span className="text-sm font-bold text-fg">
                    {i + 1}. {step.title}
                  </span>
                  <span className="mt-1 block text-sm leading-relaxed text-fg-muted">
                    {step.body}
                  </span>
                  {step.tools.length > 0 && (
                    <span className="mt-2 block">
                      <span className="text-xs font-semibold uppercase tracking-wider text-fg-subtle">
                        {t.toolsLabel}
                      </span>
                      <span className="mt-1 flex flex-wrap gap-1.5">
                        {step.tools.map((tool, j) => (
                          <span
                            key={j}
                            className="rounded-full bg-neutral-fill px-2.5 py-0.5 text-xs font-semibold text-neutral-fg"
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
