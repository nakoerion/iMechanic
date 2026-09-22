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
    /* Field legend on the code's system plate (e.g. "SYSTEM · Ignition").
       A label, not a claim: it names the catalog column it renders. */
    systemLabel: "System",
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
    errorNote:
      "Something went wrong asking for the AI analysis — your free verdict above is unaffected. Try again.",
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
    sendError: "We couldn't send the link just now — please try again.",
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
    manualHint:
      "For example P0420 — one letter P, C, B or U plus four characters. Several codes at once works too: separate them with spaces or commas.",
    manualButton: "Save as scan",
    manualSaving: "Saving…",
    manualInvalid:
      "That doesn't look like a fault code — check it and try again.",
    liveHeading: "Connect your adapter",
    liveDescription:
      "Plug in your ELM327 adapter, switch the ignition on (engine can stay off), then connect.",
    liveConnectBluetooth: "Connect over Bluetooth",
    liveConnectSerial: "Connect over USB",
    liveConnectNative: "Connect over Bluetooth (app)",
    liveNativeNote:
      "Uses the app's own Bluetooth bridge — that is what makes a real adapter work on iPhone, where the browser has no Bluetooth of its own.",
    liveConnecting: "Connecting…",
    liveReading: "Reading codes…",
    /* A5 — the ignition sequence. `steps` are the approved procedure names
     * (proposal §4); they label the four ticks on the rail, and are never
     * rendered as a claim of their own. `railLabel` and `transcriptLabel` are
     * field legends, like `faultCode.systemLabel`. */
    steps: {
      connect: "Connect",
      initialise: "Initialise",
      read: "Read",
      interpret: "Interpret",
    },
    railLabel: "Scan procedure",
    /* The live-only transcript panel. It shows exchanges the adapter actually
     * sent — never a raw dump, never a synthesised line. */
    transcriptLabel: "Adapter link",
    /* Status line for the final rail step: the app is running the fault-code
     * rulebook over the codes it just read. */
    interpreting: "Interpreting the codes…",
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
    resultEmpty:
      "No fault codes found. The car reports a clean bill of health.",
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
    clearDemoNote:
      "This resets the simulated demo adapter — it touches no real car.",
    clearFreeNote: "Free, always — no pay-to-clear, ever.",
    clearing: "Clearing…",
    cleared: "Clear request sent. Re-scan to confirm the codes are gone.",
    clearError:
      "Clearing didn't go through — your codes are untouched. Try again.",
    clearManualNote:
      "Only a connected car can be cleared — a typed code has nothing on the car to erase.",
    saveError: "We couldn't save that scan — nothing was stored. Try again.",
    latestHeading: "Last scan",
    newScanButton: "Start a new scan",
    newScanRunning: "Starting…",
  },
  history: {
    title: "History",
    description: "Every scan you run, with the verdict it got.",
    /* The list is real data now (phase 2a) — these strings must never imply
       that anything is still "coming". An empty list is simply empty. */
    emptyEyebrow: "Empty",
    emptyTitle: "No scans yet",
    emptyDescription:
      "Run a scan — live from an adapter, the demo, or a code typed in by hand — and it lands here automatically with its verdict.",
    emptyAction: "Start a scan",
    errorTitle: "We couldn't load your history",
    errorDescription:
      "Your scans are still saved — this screen just couldn't read them. Try again.",
    retry: "Try again",
    loading: "Loading your scans…",
    /* Source badges: a demo scan is ALWAYS labelled demo. Never presented
       as a real reading from a car. */
    sourceLive: "Live scan",
    sourceDemo: "Demo — simulated data",
    sourceManual: "Manual entry",
    noCodes: "No fault codes found — a clean scan.",
    unknownCode: "Not in our catalog",
    moreCodes: (n: number) => `+${n} more code${n === 1 ? "" : "s"}`,
    countLabel: (n: number) => `${n} code${n === 1 ? "" : "s"}`,
    dateUnknown: "Date unknown",
    justNow: "Just now",
    minutesAgo: (n: number) => `${n} min ago`,
    hoursAgo: (n: number) => `${n} hour${n === 1 ? "" : "s"} ago`,
    daysAgo: (n: number) => `${n} day${n === 1 ? "" : "s"} ago`,
  },
  vehicles: {
    title: "Vehicles",
    /* Honest and modest (phase 2b): a vehicle is a record the user adds and
       nothing more is claimed for it — no "unlock", no plan/limit talk. */
    description:
      "The cars you've added — make, model and, if you know it, the year.",
    loading: "Loading your vehicles…",
    errorTitle: "We couldn't load your vehicles",
    errorDescription:
      "Your saved vehicles are still there — this screen just couldn't read them. Try again.",
    retry: "Try again",
    emptyEyebrow: "Empty",
    emptyTitle: "No vehicles yet",
    emptyDescription:
      "Add a car and it shows up here. Make and model are all that's needed; the year is optional.",
    emptyAction: "Add a vehicle",
    addButton: "Add vehicle",
    formTitle: "Add a vehicle",
    formHint: "Stored as make, model and year. You can add more than one.",
    makeLabel: "Make",
    makeHint: "Start typing, or pick a make",
    modelLabel: "Model",
    modelHint: "Start typing, or pick a model",
    yearLabel: "Year (optional)",
    yearPlaceholder: "Start typing, or pick a year",
    /* The three pickers are a SUGGESTION aid, never a gate: `createVehicle` and
       the database still accept any non-empty make/model the user types, so
       every string here is honest that the list is a short, popular, curated
       one — never "all models" — and that typing your own is fine. */
    picker: {
      showSuggestions: "Show suggestions",
      count: (n: number) =>
        `${n} suggestion${n === 1 ? "" : "s"} available`,
      otherOption: (typed: string) =>
        `Other — save “${typed}” exactly as I typed it`,
      customNote:
        "Not in our list of popular cars — that's fine, we'll save it exactly as you type it.",
      make: {
        hint: "Popular makes — start typing to filter, or type your car's make if you don't see it.",
        listLabel: "Popular makes",
        listNote: "A short list of common makes, not every make.",
        emptyMessage:
          "No popular make matches that — type it anyway and press Save, we'll keep it as you typed it.",
      },
      model: {
        hint: "Popular models for the make you picked — or type the model yourself.",
        listLabel: "Popular models for this make",
        listNote: "Common models only — type yours if it's missing.",
        emptyMessage:
          "No popular model matches that — type it anyway and press Save, we'll keep it as you typed it.",
        noMakeYet:
          "Models are suggested once we know the make — you can always type the model instead.",
      },
      year: {
        hint: (oldest: number, newest: number) =>
          `Any year from ${oldest} to ${newest} — or leave it empty.`,
        listLabel: "Model year",
        listNote: "Newest first — type a year to jump to it.",
        emptyMessage: "Type a four-digit year, or pick one from the list.",
      },
    },
    makeRequired: "Enter the make — for example VW.",
    modelRequired: "Enter the model — for example Golf.",
    yearInvalid: "Enter a year from 1980 to next year, or leave it empty.",
    saveButton: "Save vehicle",
    saving: "Saving…",
    cancel: "Cancel",
    saveError:
      "We couldn't save that vehicle — nothing was stored. Try again.",
    saved: "Vehicle added.",
    refreshError:
      "The vehicle was added, but this list couldn't refresh. Try again to see it.",
    countLabel: (n: number) => `${n} vehicle${n === 1 ? "" : "s"}`,
    unnamed: "Unnamed car",
    yearPrefix: "Year",
  },
  /* iMechanic Pro — the paid tier (S6b). Every gate in the app is ONE
     component (`ProUpgradePrompt`) using these strings, so the paywall speaks
     with one voice: what Pro adds, what stays free, and where to go.
     No lock icons, no countdowns, no scarcity — the free surfaces above a gate
     are never blurred, dimmed or badged. */
  pro: {
    name: "iMechanic Pro",
    eyebrow: "iMechanic Pro",
    /* /app/pro screen */
    pageTitle: "iMechanic Pro",
    pageDescription:
      "The parts of iMechanic that go beyond reading codes. Whatever you choose, reading codes and clearing them stays free.",
    freeHeading: "Free, always",
    freeItems: [
      "Connect your adapter and read the codes",
      "Plain-English meaning for every code we know",
      "The severity verdict: drive on, repair soon, or stop driving",
      "Clearing codes, with the honest warnings",
      "Your 3 most recent scans and 1 vehicle",
    ],
    proHeading: "What Pro adds",
    proItems: [
      "AI root cause, with its reasoning and a confidence figure",
      "The DIY-vs-workshop cost decision for the repair",
      "Guided repair steps, the tools you need, and a re-scan to verify",
      "Your full scan history",
      "As many vehicles as you own",
    ],
    /* The one reassurance that must appear with every gate. */
    freeNote:
      "Reading codes, the severity verdict and clearing codes stay free — always.",
    cta: "See iMechanic Pro",
    checking: "Checking your plan…",
    checkError:
      "We couldn't check your plan just now, so Pro features stay hidden for the moment. Your free verdict and codes are unaffected.",
    retry: "Check again",
    aiTitle: "AI root cause is part of iMechanic Pro",
    aiBody:
      "Pro asks the AI for the most likely root cause behind your codes, with its reasoning, a confidence figure and what to check first. The rulebook verdict above stands on its own.",
    repairTitle: "The repair decision and guided steps are part of iMechanic Pro",
    repairBody:
      "Pro shows what this repair usually costs as a DIY-vs-workshop band, then walks you through the fix step by step with the tools you need.",
    historyTitle: "Your full scan history is part of iMechanic Pro",
    historyBody: (hidden: number) =>
      `The free plan shows your 3 most recent scans. ${hidden} older ${
        hidden === 1 ? "scan is" : "scans are"
      } saved but not shown here.`,
    vehicleTitle: "More vehicles are part of iMechanic Pro",
    vehicleBody: (hidden: number) =>
      `The free plan keeps 1 vehicle in the garage. Your other ${hidden} ${
        hidden === 1 ? "vehicle is" : "vehicles are"
      } saved but not shown here.`,
    vehicleAddNote:
      "The free plan keeps 1 vehicle in the garage. iMechanic Pro keeps as many as you own.",
    /* The server's refusal when a free user who already holds their one
       vehicle calls createVehicle anyway (S6d — e.g. a stale tab, or a direct
       call). Deliberately not "try again": retrying cannot work, and the
       reason is what the user needs. Same sentence the note above states. */
    vehicleLimitRefusal:
      "The free plan keeps 1 vehicle in the garage, and you already have one. iMechanic Pro keeps as many as you own.",
    /* Upgrade surface (/app/pro) — prices themselves come from market.ts. */
    bandsHeading: "Choose a band",
    bandsIntro:
      "These are three prices for the same iMechanic Pro during the beta. What will tell the bands apart is not decided yet, so pick whichever looks right to you.",
    annualSuffix: "per year",
    monthlySuffix: "per month",
    upgradeButton: "Upgrade",
    upgrading: "Opening Stripe…",
    checkoutError:
      "We couldn't start checkout just now — nothing was charged. Try again.",
    notConfiguredHeading: "Payments aren't set up yet",
    notConfiguredBody:
      "Card payments aren't connected yet, so there is nothing to buy and no button to press. The prices above are a preview: when payments go live you'll be able to subscribe from here.",
    stripeNote:
      "Payment runs through Stripe's secure checkout — we never see your card number.",
    testModeNote:
      "Beta: checkout runs on Stripe in test mode, so no card is charged and no money moves.",
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
    /* Plan block (S6b) — sourced from `getEntitlement()`, never from the URL. */
    planHeading: "Your plan",
    planFreeName: "Free plan",
    planFreeBody:
      "Codes, their meaning, the severity verdict and clearing them — free, always.",
    planProName: "iMechanic Pro",
    planStatus: {
      trialing: "Trial",
      active: "Active",
      past_due:
        "Payment failed — Pro is paused until the payment goes through.",
      canceled: "Canceled — Pro is not active.",
      incomplete: "Checkout was not completed — Pro is not active.",
      incomplete_expired: "Checkout expired — Pro is not active.",
    },
    planBand: (band: string) => `Band ${band.toUpperCase()}`,
    planBandUnknown: "Band not reported",
    planRenews: "Renews",
    planTrialEnds: "Trial ends",
    planPeriodEnd: "Renewal date not reported yet",
    planUpgradeCta: "See iMechanic Pro",
    planManageNote:
      "Billing runs through Stripe. Changing or cancelling isn't self-serve yet — it will be before launch.",
    planLoading: "Checking your plan…",
    planUnavailable: "We couldn't check your plan just now.",
    planRetry: "Check again",
    /* Checkout return notes. Honest by construction: the Pro state above comes
       from `getEntitlement()`, so a success URL never asserts an entitlement
       by itself. */
    checkoutSuccess:
      "Checkout complete. If your subscription is active, it shows above — this page reads your real status, not this message.",
    checkoutCanceled:
      "Checkout was canceled — nothing was charged and your plan is unchanged.",
  },
} as const;
