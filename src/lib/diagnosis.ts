/**
 * Deterministic severity rules engine (Slice S3, merge-gate R1).
 *
 * Pure and client-safe: no Node builtins, no server imports. Shared by the
 * scan server functions (which persist one `diagnoses` row per scan with
 * source='rules') exactly like `dtc.ts` is shared by the OBD drivers.
 *
 * First-match-wins priority ladder, evaluated over the scan's fault codes
 * (+ their catalog metadata). verdict ∈ drive_on | repair_soon |
 * stop_driving — never "unknown": an honest default of repair_soon is
 * conservative by design.
 *
 *   stop_driving:
 *     1. coolant ≥ 115 °C — INERT (see below).
 *     2. voltage < 12.0 V with RPM > 400 — INERT (see below).
 *     3. a STORED misfire (P0300–P0308) together with stored P0420/P0430 —
 *        active exhaust damage the driver would not feel yet. THIS ONE FIRES.
 *   repair_soon:
 *     4. a stored misfire alone.
 *     5. stored lean/rich, O2, MAF, EGR or voltage family codes.
 *   drive_on:
 *     6. every stored code is catalyst/EVAP/thermostat — or no stored codes.
 *   default:
 *     7. anything else (unknown codes, pending-only): repair_soon.
 *
 * SCOPE DECISION (lead, 2026-09-08 — do not relitigate): S3 reads fault
 * codes only (modes 03/07/0A). Live PID data (coolant temperature, voltage,
 * RPM) is NOT read by S3, so rules 1–2 cannot fire from code-only data and
 * live in this module as a clearly-marked INERT layer: they are present in
 * the code, their condition evaluators exist and are tested as
 * "not fireable from code-only input", but they never trigger. A later
 * slice that reads live PIDs flips them on by passing sensor data in.
 *
 * severity_default from dtc_catalog is a DISPLAY HINT ONLY — the engine
 * never overrides a verdict on it. It reaches the UI as per-code severity
 * for the fault-code cards, nothing more.
 */

export type Verdict = "drive_on" | "repair_soon" | "stop_driving";

export type DtcStatus = "stored" | "pending" | "permanent";

/** One code as the rules engine sees it. */
export type EngineCode = {
  code: string;
  status: DtcStatus;
};

/** Catalog metadata the engine may consult (display + family lookup). */
export type CatalogEntry = {
  code: string;
  title: string | null;
  system: string | null;
  generic_cause: string | null;
  severity_default: string | null;
};

/**
 * Live sensor snapshot — INERT in S3. The fields exist so a future slice
 * that reads live PIDs can pass real values; until then callers omit them
 * (or pass nulls) and every sensor rule evaluates to "not fireable".
 */
export type SensorSnapshot = {
  coolantCelsius?: number | null;
  voltageVolts?: number | null;
  rpm?: number | null;
};

export type DiagnosisInput = {
  codes: EngineCode[];
  catalog?: Map<string, CatalogEntry> | Record<string, CatalogEntry>;
  sensors?: SensorSnapshot;
};

export type PerCodeSeverity = {
  code: string;
  status: DtcStatus;
  /** Display-only severity for the fault-code card (never a verdict). */
  severity: Verdict;
  title: string | null;
  genericCause: string | null;
  system: string | null;
  known: boolean;
};

export type DiagnosisResult = {
  verdict: Verdict;
  summary: string;
  reasons: string[];
  perCode: PerCodeSeverity[];
};

/* ------------------------------------------------------------------ */
/* Code families (generic P-codes — sound automotive judgment)          */
/* ------------------------------------------------------------------ */

function upper(code: string): string {
  return code.trim().toUpperCase();
}

/** Stored misfire: P0300–P0308 (P0300 random + P0301–P0308 cylinders). */
export function isMisfireCode(code: string): boolean {
  const c = upper(code);
  if (!/^P030[0-8]$/.test(c)) return false;
  return true;
}

/** Stored catalyst pair whose damage a misfire accelerates: P0420/P0430. */
export function isCatalystPairCode(code: string): boolean {
  const c = upper(code);
  return c === "P0420" || c === "P0430";
}

const REPAIR_SOON_FAMILIES: { name: string; test: (code: string) => boolean }[] = [
  {
    name: "misfire",
    test: (c) => isMisfireCode(c),
  },
  {
    name: "lean/rich fuel mixture",
    test: (c) =>
      /^(P017[1-5]|P2195|P2196|P2197|P2198|P2187|P2188|P2189|P2190)$/.test(c),
  },
  {
    name: "oxygen sensor",
    test: (c) => /^P01(3[0-9]|4[0-9]|5[0-9])$/.test(c),
  },
  {
    name: "airflow / intake temperature",
    test: (c) => /^P01(0[1-9]|1[0-4])$/.test(c),
  },
  {
    name: "EGR",
    test: (c) => /^P04(0[1-9]|1[0-9])$/.test(c),
  },
  {
    name: "charging / voltage",
    test: (c) => /^P056[0-3]$/.test(c),
  },
  {
    name: "throttle / idle",
    test: (c) => /^(P012[1-3]|P022[1-3]|P050[5-7]|P2101)$/.test(c),
  },
  {
    name: "knock / crank / cam position",
    test: (c) => /^P03(2[5-9]|3[0-9]|4[0-9])$/.test(c),
  },
];

/** Families that may sit at drive_on when nothing worse is stored. */
function isDriveOnFamily(code: string): boolean {
  const c = upper(code);
  if (c === "P0420" || c === "P0430" || c === "P0421" || c === "P0431")
    return true; // catalyst
  if (/^P044[0-9]$/.test(c) || /^P045[5-9]$/.test(c) || c === "P0496")
    return true; // EVAP
  if (c === "P0128") return true; // thermostat
  return false;
}

function repairSoonFamilyName(code: string): string | null {
  const c = upper(code);
  for (const f of REPAIR_SOON_FAMILIES) {
    if (f.test(c)) return f.name;
  }
  return null;
}

/* ------------------------------------------------------------------ */
/* Sensor rules — INERT layer (see module header)                       */
/* ------------------------------------------------------------------ */

/**
 * Sensor rule conditions, evaluated ONLY when live PID data is present.
 * With no sensor snapshot (or null fields) every one returns false —
 * that is the S3 code-only path, and the unit tests pin it: these rules
 * are present-but-inert.
 */
export const SENSOR_RULES = {
  /** Stop: coolant ≥ 115 °C — engine-overheat territory. */
  coolantOverheat(sensors?: SensorSnapshot): boolean {
    const t = sensors?.coolantCelsius;
    return typeof t === "number" && Number.isFinite(t) && t >= 115;
  },
  /** Stop: voltage < 12.0 V while the engine runs (RPM > 400) — the
   * charging system is not keeping up. */
  chargingFailure(sensors?: SensorSnapshot): boolean {
    const v = sensors?.voltageVolts;
    const rpm = sensors?.rpm;
    return (
      typeof v === "number" &&
      Number.isFinite(v) &&
      typeof rpm === "number" &&
      Number.isFinite(rpm) &&
      v < 12.0 &&
      rpm > 400
    );
  },
} as const;

/* ------------------------------------------------------------------ */
/* Main entry: first-match-wins                                        */
/* ------------------------------------------------------------------ */

export const RULES_CONFIDENCE = 70;

export function diagnose(input: DiagnosisInput): DiagnosisResult {
  const codes = input.codes.map((c) => ({
    code: upper(c.code),
    status: c.status,
  }));
  const sensors = input.sensors;

  const catalog: Map<string, CatalogEntry> =
    input.catalog instanceof Map
      ? input.catalog
      : new Map(Object.entries(input.catalog ?? {}));

  const stored = codes.filter((c) => c.status === "stored");
  const storedSet = new Set(stored.map((c) => c.code));
  const unknownStored = stored.filter((c) => !catalog.has(c.code));

  const perCode: PerCodeSeverity[] = codes.map((c) => {
    const entry = catalog.get(c.code);
    const family = repairSoonFamilyName(c.code);
    let severity: Verdict;
    if (entry) {
      // Display hint from the catalog; fall back to family judgment when
      // the seeded hint is missing. NEVER a verdict input.
      severity =
        entry.severity_default === "drive_on" ? "drive_on" : "repair_soon";
      if (!entry.severity_default) {
        severity = isDriveOnFamily(c.code)
          ? "drive_on"
          : family
            ? "repair_soon"
            : "repair_soon";
      }
    } else if (isDriveOnFamily(c.code)) {
      severity = "drive_on";
    } else {
      severity = "repair_soon";
    }
    return {
      code: c.code,
      status: c.status,
      severity,
      title: entry?.title ?? null,
      genericCause: entry?.generic_cause ?? null,
      system: entry?.system ?? null,
      known: Boolean(entry),
    };
  });

  // — Rule 1 (INERT in S3): coolant ≥ 115 °C → stop_driving. —
  if (SENSOR_RULES.coolantOverheat(sensors)) {
    return {
      verdict: "stop_driving",
      summary:
        "The engine is overheating. Stop as soon as it is safe to do so.",
      reasons: [
        "The coolant temperature is 115 °C or higher, which means the engine is overheating.",
      ],
      perCode,
    };
  }

  // — Rule 2 (INERT in S3): voltage < 12.0 V with RPM > 400 → stop_driving. —
  if (SENSOR_RULES.chargingFailure(sensors)) {
    return {
      verdict: "stop_driving",
      summary:
        "The charging system is failing while the engine runs. Stop as soon as it is safe to do so.",
      reasons: [
        "System voltage is below 12.0 V with the engine running, which points to a failing alternator or battery connection.",
      ],
      perCode,
    };
  }

  // — Rule 3: stored misfire + stored P0420/P0430 → stop_driving. —
  const storedMisfire = [...storedSet].find((c) => isMisfireCode(c));
  const storedCatPair = [...storedSet].find((c) => isCatalystPairCode(c));
  if (storedMisfire && storedCatPair) {
    return {
      verdict: "stop_driving",
      summary:
        "A misfire is sending unburnt fuel into an already weak catalyst. Stop driving before it melts the converter.",
      reasons: [
        `Stored misfire ${storedMisfire} together with stored catalyst code ${storedCatPair}: unburnt fuel overheats and destroys the catalytic converter.`,
      ],
      perCode,
    };
  }

  // — Rule 4: stored misfire alone → repair_soon. —
  if (storedMisfire) {
    return {
      verdict: "repair_soon",
      summary: "The engine is misfiring. Still driveable — book it in soon.",
      reasons: [
        `Stored misfire ${storedMisfire}. Commonly a worn spark plug or ignition coil.`,
      ],
      perCode,
    };
  }

  // — Rule 5: stored lean/rich, O2, MAF, EGR, voltage (or related) → repair_soon. —
  const storedFamily = stored.find((c) => repairSoonFamilyName(c.code));
  if (storedFamily) {
    const family = repairSoonFamilyName(storedFamily.code) ?? "engine management";
    return {
      verdict: "repair_soon",
      summary:
        "Something in the engine management needs attention. Still driveable — book it in soon.",
      reasons: [
        `Stored ${family} code ${storedFamily.code} points to a fuelling, air, sensor or emissions fault.`,
      ],
      perCode,
    };
  }

  // — Unknown stored codes with no family → conservative repair_soon
  // (rule 7 applied to stored codes before the drive_on check, so an
  // unseeded code can never hide behind a drive_on verdict). —
  if (unknownStored.length > 0) {
    const first = unknownStored[0]!;
    return {
      verdict: "repair_soon",
      summary:
        "We do not recognise this code yet, so we are calling it repair-soon to be safe.",
      reasons: [
        `${first.code} is not in our catalog yet — no cause invented. Conservative verdict until it is looked up.`,
      ],
      perCode,
    };
  }

  // — Rule 6: every stored code is catalyst/EVAP/thermostat, or the scan
  // is completely empty → drive_on. A scan with ONLY pending/permanent
  // codes is NOT drive_on — pending faults are unconfirmed, so they fall
  // through to the conservative repair_soon default (rule 7). —
  if (codes.length === 0) {
    return {
      verdict: "drive_on",
      summary: "No fault codes on this scan. Safe to keep driving.",
      reasons: ["No codes at all on this scan — nothing to judge."],
      perCode,
    };
  }
  const allDriveOn =
    stored.length > 0 && stored.every((c) => isDriveOnFamily(c.code));
  if (allDriveOn) {
    return {
      verdict: "drive_on",
      summary:
        "Emissions or warm-up faults only. Safe to keep driving — fix when convenient.",
      reasons: [
        `Every stored code (${stored.map((c) => c.code).join(", ")}) is a catalyst, EVAP or thermostat fault, which affects emissions or warm-up, not safe driving.`,
      ],
      perCode,
    };
  }

  // — Rule 7 (default): everything else → repair_soon, conservative. —
  const firstStored = stored[0];
  return {
    verdict: "repair_soon",
    summary:
      "Something needs attention. Still driveable — book it in soon.",
    reasons: firstStored
      ? [
          `Stored code ${firstStored.code} does not match a drive-on family, so this stays repair-soon.`,
        ]
      : [
          "Only pending or permanent codes on this scan, and pending faults are unconfirmed — repair-soon to be safe.",
        ],
    perCode,
  };
}

/** Root-cause line for the diagnoses row: highest-priority code's
 * generic_cause, or an honest fallback. Never invented. */
export function rootCauseFor(result: DiagnosisResult): string {
  const withCause = result.perCode.find((c) => c.genericCause);
  if (withCause?.genericCause) return withCause.genericCause;
  const unknown = result.perCode.find((c) => !c.known);
  if (unknown) return `No catalog entry for ${unknown.code} yet — not looked up.`;
  if (result.perCode.length === 0) return "No fault codes on this scan.";
  return "No catalog entry for these codes yet — not looked up.";
}
