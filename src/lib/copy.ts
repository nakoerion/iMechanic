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
