import { AlertIcon } from "../icons";
import { APP_COPY } from "../../lib/copy";
import { COST_ESTIMATE_NOTE, type RepairFamily } from "../../lib/cost";
import {
  formatMoneyRange,
  MARKETS,
  resolveMarket,
  type Market,
} from "../../lib/market";

/**
 * CostDecisionCard — the free Decide surface (S5 UI).
 *
 * Renders the DIY band and the workshop band for the diagnosis's repair
 * family in the caller's market, always with COST_ESTIMATE_NOTE attached.
 * Costs are estimates: bands via formatMoneyRange, never a single
 * false-precision number. No price is hard-coded — everything comes from
 * `src/lib/cost.ts` + `src/lib/market.ts` (AGENTS.md: pricing).
 *
 * When `workshopRecommended` is true the card carries a plain SAFETY
 * recommendation. It is deliberately not an upsell surface: no lock icon,
 * no Pro badge, no "upgrade" language, no dimming or blurring of anything.
 * The AI/Pro framing stays on the AI panel — never here.
 */

const CURRENCY_MARKETS: Record<string, Market> = {
  EUR: MARKETS.DE,
  GBP: MARKETS.GB,
  ALL: MARKETS.AL,
};

function marketFor(savedCurrency: string | null, savedCountry?: string | null) {
  if (savedCountry) return resolveMarket(savedCountry);
  if (savedCurrency && CURRENCY_MARKETS[savedCurrency]) {
    return CURRENCY_MARKETS[savedCurrency];
  }
  return resolveMarket(null);
}

const FAMILY_LABELS: Record<RepairFamily, string> = {
  ignition: "Ignition — spark plugs and coils",
  oxygen_sensor: "Oxygen (lambda) sensor",
  catalyst: "Catalytic converter",
  evap: "EVAP — fuel vapour system",
  cooling: "Cooling system",
  airflow: "Air intake and fuel trim",
  egr: "EGR valve",
  charging: "Battery and charging",
  throttle_idle: "Throttle body and idle",
  engine_timing: "Engine timing sensors",
  general: "General diagnosis",
};

export function CostDecisionCard({
  family,
  currency,
  diyLowCents,
  diyHighCents,
  shopLowCents,
  shopHighCents,
  workshopRecommended,
  country,
}: {
  family: RepairFamily | string;
  /** Persisted `diagnoses.currency` — picks the market when no country given. */
  currency: string | null;
  diyLowCents: number;
  diyHighCents: number;
  shopLowCents: number;
  shopHighCents: number;
  workshopRecommended: boolean;
  /** Optional `users.country` (DE/GB/AL) — wins over currency when present. */
  country?: string | null;
}) {
  const t = APP_COPY.decideAct;
  const market = marketFor(currency, country);
  const familyLabel =
    FAMILY_LABELS[family as RepairFamily] ?? FAMILY_LABELS.general;

  return (
    <section
      aria-label={t.decideHeading}
      className="rounded-card border border-line bg-surface p-5 shadow-sm"
    >
      <h2 className="text-sm font-bold text-fg">{t.decideHeading}</h2>
      <p className="mt-1 text-xs leading-relaxed text-fg-subtle">
        {t.decideIntro} {familyLabel}.
      </p>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <div className="rounded-card border border-line bg-surface-sunken p-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-fg-subtle">
            {t.diyLabel}
          </p>
          <p className="mt-1 text-xl font-extrabold tracking-tight text-fg">
            {formatMoneyRange(diyLowCents, diyHighCents, market)}
          </p>
          <p className="mt-1 text-xs leading-relaxed text-fg-subtle">
            {t.diyHint}
          </p>
        </div>
        <div className="rounded-card border border-line bg-surface-sunken p-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-fg-subtle">
            {t.workshopLabel}
          </p>
          <p className="mt-1 text-xl font-extrabold tracking-tight text-fg">
            {formatMoneyRange(shopLowCents, shopHighCents, market)}
          </p>
          <p className="mt-1 text-xs leading-relaxed text-fg-subtle">
            {t.workshopHint}
          </p>
        </div>
      </div>

      {/* Safety routing — plain warning styling, never upsell styling. */}
      {workshopRecommended && (
        <div
          role="note"
          className="mt-4 rounded-card border-2 border-danger bg-danger-fill p-4"
        >
          <p className="flex items-start gap-2 text-sm font-bold text-danger-fg">
            <AlertIcon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            {t.workshopRecommendedTitle}
          </p>
          <p className="mt-1 text-sm leading-relaxed text-danger-fg">
            {t.workshopRecommendedBody}
          </p>
        </div>
      )}

      <p className="mt-3 text-xs leading-relaxed text-fg-subtle">
        {COST_ESTIMATE_NOTE}
      </p>
    </section>
  );
}
