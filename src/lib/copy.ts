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
    /* Shown for codes missing from the seeded catalog — the code text is
     * never invented, only the lookup is missing. */
    notInCatalogNote:
      "Not in our catalog yet — we have not looked this one up, so no meaning is shown rather than a guessed one. Your code is saved and stays free to read.",
    diagnosisReasonsLabel: "Why this verdict",
    verdictMismatchNote:
      "Saved before the verdict layer shipped — re-scan to get a verdict.",
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
  aiRootCause: {
    heading: "AI root cause",
    triggerLabel: "Get AI root cause",
    /* Pro surface, pre-S6: plain wording, no lock icon, no blur, no urgency. */
    proNote: "A Pro feature — deeper analysis of your codes, in plain English.",
    loadingLabel: "Thinking…",
    rootCauseLabel: "Most likely root cause",
    confidenceLabel: "Confidence",
    rankedCausesLabel: "What to check first, in order",
    unavailableHeading: "AI diagnosis isn't available",
    errorNote: "Something went wrong asking for the AI analysis — your free verdict above is unaffected. Try again.",
  },
  decideAct: {
    decideHeading: "DIY or workshop?",
    decideIntro:
      "What this kind of repair usually costs — as bands, never a quote.",
    diyLabel: "Doing it yourself",
    diyHint: "Parts plus your own time.",
    workshopLabel: "Independent workshop",
    workshopHint: "Parts plus labour at an independent garage.",
    workshopRecommendedTitle: "Book a workshop — this one is not safe to DIY",
    workshopRecommendedBody:
      "This fault can make the car unsafe or destroy expensive parts if it is worked on without the right tools. Take it to a workshop rather than attempting it yourself.",
    actHeading: "Guided repair",
    safetyLabel: "Safety first",
    toolsLabel: "You'll need",
    minutesShort: "min",
    startButton: "Start this repair",
    startingButton: "Starting…",
    inProgressButton: "I'm working on it",
    doneButton: "I've finished the steps",
    advancingButton: "Saving…",
    jobPlannedNote: "Planned — work through the steps above at your own pace.",
    jobInProgressNote: "In progress — tick steps off as you go.",
    jobDoneNote: "Done — now confirm with a re-scan below.",
    verifyHeading: "Did the repair work?",
    verifyDescription:
      "Clear the codes, drive normally, then run a new scan. Verifying compares your latest scan against this one.",
    verifyButton: "Verify with my latest scan",
    verifyingButton: "Checking…",
    verifySameScanNote:
      "Your latest scan is this same scan — run a new scan after the repair, then verify against it.",
    verifiedTitle: "Repair verified",
    verifiedBody:
      "Your latest scan no longer shows the original fault codes. Nice work — the repair held.",
    stillPresentTitle: "Still present",
    stillPresentBody:
      "Your latest scan still shows these codes — the fault is still there. Recheck the steps above or book a workshop.",
    jobErrorNote:
      "That didn't go through — your repair progress is unchanged. Try again.",
    signInNote: "Sign in to track repairs.",
  },
  gallery: {
    title: "Design system gallery",
    internalBadge: "Internal — not a product screen",
    sampleBadge: "Sample data",
    intro:
      "Every design-system component in one place, for review. Nothing here is real vehicle data.",
  },
  signIn: {
    eyebrow: "Sign in",
    title: "Sign in with your email",
    description:
      "No password. We email you a one-time sign-in link that works for 15 minutes.",
    emailLabel: "Email",
    emailHint: "Used only for signing in. We never share it.",
    sendButton: "Send magic link",
    sendingButton: "Sending…",
    sentEyebrow: "Check your email",
    sentTitle: "Your sign-in link is on its way",
    sentDescription:
      "If an account exists for that address, you'll get the link in a minute or two. It expires after 15 minutes.",
    sentNote:
      "No email? Check spam, or request a new link — but wait a minute first.",
    sendError:
      "We couldn't send the link just now — please try again.",
    requestAgain: "Request another link",
    invalidLinkTitle: "This sign-in link is broken or expired",
    invalidLinkDescription:
      "Links are single-use and expire after 15 minutes. Request a new one and try again.",
    backToSignIn: "Back to sign in",
  },
  scan: {
    title: "Scan",
    description: "Read your fault codes and decide what to do next.",
    demoLabel: "Demo",
    manualLabel: "Manual",
    liveLabel: "Live adapter",
    demoHeading: "Try the demo",
    demoDescription:
      "A simulated adapter with a small demo dataset — no hardware needed. Clearly labelled, saved as a demo scan.",
    demoDatasetNote: "Demo car: a 2016 petrol hatchback. Not a real vehicle.",
    demoButton: "Run demo scan",
    demoRunning: "Reading demo codes…",
    manualHeading: "Type a fault code",
    manualDescription:
      "Already read the code elsewhere? Type it in and it becomes a scan with one stored code.",
    manualLabelInput: "Fault code",
    manualHint: "For example P0420 — one letter P, C, B or U plus four characters. Several codes at once works too: separate them with spaces or commas.",
    manualButton: "Save as scan",
    manualSaving: "Saving…",
    manualInvalid: "That doesn't look like a fault code — check it and try again.",
    liveHeading: "Connect your adapter",
    liveDescription:
      "Plug in your ELM327 adapter, switch the ignition on (engine can stay off), then connect.",
    liveConnectBluetooth: "Connect over Bluetooth",
    liveConnectSerial: "Connect over USB",
    liveConnecting: "Connecting…",
    liveReading: "Reading codes…",
    liveUnavailableTitle: "Live connect isn't available in this browser",
    liveUnavailableDescription:
      "This browser supports neither Web Bluetooth nor Web Serial, so it cannot talk to an OBD2 adapter. Demo mode works everywhere with no hardware, or type a code in manually.",
    liveErrorPrefix: "Live connection failed.",
    vehicleHeading: "Which car is this for?",
    vehicleNone: "No car attached — the scan saves without one.",
    vehicleExistingLabel: "Your cars",
    vehicleNewMakeLabel: "Make",
    vehicleNewMakeHint: "For example VW",
    vehicleNewModelLabel: "Model",
    vehicleNewModelHint: "For example Golf",
    vehicleNewYearLabel: "Year (optional)",
    vehicleAttachNew: "Add this car and attach it",
    vehicleAttaching: "Adding…",
    resultHeading: "Codes read",
    resultDemoBadge: "Demo scan — simulated data, not a real car",
    resultManualBadge: "Manual entry — typed in by you",
    resultLiveBadge: "Live scan — read from your adapter",
    resultEmpty: "No fault codes found. The car reports a clean bill of health.",
    resultVinLabel: "VIN reported",
    resultSavedNote: "Saved to your history.",
    clearButton: "Clear codes",
    clearConfirm: "Clearing tells the car to erase its stored codes.",
    /* R4 safety honesty: clearing hides rather than fixes (the light may
     * come back), and it resets the readiness monitors (drive cycle needed
     * before a TÜV / MOT inspection). Free surfaces — never locked. */
    clearHidesNote:
      "Clearing without fixing the fault hides the problem rather than solving it — if the fault is still there, the light may come back.",
    clearReadinessNote:
      "Clearing also resets the car's readiness monitors. Before an emissions or roadworthiness inspection (TÜV / MOT), the car needs a drive cycle for the monitors to report ready again, or it may not pass.",
    clearDemoNote: "This resets the simulated demo adapter — it touches no real car.",
    clearFreeNote: "Free, always — no pay-to-clear, ever.",
    clearing: "Clearing…",
    cleared: "Clear request sent. Re-scan to confirm the codes are gone.",
    clearError: "Clearing didn't go through — your codes are untouched. Try again.",
    clearManualNote: "Only a connected car can be cleared — a typed code has nothing on the car to erase.",
    saveError: "We couldn't save that scan — nothing was stored. Try again.",
    latestHeading: "Last scan",
    newScanButton: "Start a new scan",
    newScanRunning: "Starting…",
  },
  account: {
    title: "Account",
    description: "Your email, your country, your subscription.",
    currentEmailLabel: "Signed in as",
    countryHeading: "Your country",
    countryHint:
      "Pricing and labour rates match your market. You can change this any time.",
    countrySaved: "Country saved.",
    countryError: "Couldn't save your country — please try again.",
    signOutButton: "Sign out",
    signedOutEyebrow: "Not signed in",
    signedOutTitle: "Sign in to see your account",
    signedOutDescription:
      "Your email, your country and your subscription live here once you're signed in.",
    signInButton: "Sign in with email",
  },
} as const;
