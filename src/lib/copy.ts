/**
 * All user-facing strings for the app shell and design-system surfaces.
 *
 * The beta is English-only, but no string is inlined in JSX — every component
 * reads copy from here or takes it as a prop. When a second language lands,
 * this object becomes the `en` bundle and nothing in the components changes.
 */

export const APP_COPY = {
  brand: {
    name: "iMechanic",
    homeLabel: "iMechanic — app home",
  },
  nav: {
    label: "Main",
    scan: "Scan",
    history: "History",
    vehicle: "Vehicle",
    account: "Account",
  },
  theme: {
    heading: "Appearance",
    description:
      "Dark is easier on the eyes in a garage at night; light is easier in daylight.",
    groupLabel: "Theme",
  },
  faultCode: {
    meaningLabel: "What this means",
    likelyCauseLabel: "Common cause",
    statusLabel: {
      stored: "Stored",
      pending: "Pending",
      permanent: "Permanent",
    },
    freeNote: "Reading this code and clearing it is free.",
  },
  verdict: {
    heading: "Severity verdict",
    /* Mirrors the wording published on the marketing page. */
    freeNote: "Severity verdict on standard code lookups — free, always.",
    sourceRules: "Based on the fault-code rulebook",
    sourceAi: "AI-assisted, checked against the fault-code rulebook",
    aiUnavailable:
      "AI root-cause analysis is unavailable right now, so this is the rulebook verdict only.",
    codesLabel: "Codes read",
  },
  gallery: {
    title: "Design system gallery",
    internalBadge: "Internal — not a product screen",
    sampleBadge: "Sample data",
    intro:
      "Every design-system component in one place, for review. Nothing here is real vehicle data.",
  },
} as const;
