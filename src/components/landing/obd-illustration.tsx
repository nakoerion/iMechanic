import { cn } from "../../lib/cn";

/**
 * ObdIllustration (M2) — a hand-held ELM327 dongle going into a car's 16-pin
 * OBD2 port.
 *
 * Why it exists: the hero had one blurred amber blob, the default SaaS
 * gradient. The redesign's allowed-motif list (proposal §5, motif 5) asks for
 * the OBD2 port + dongle instead — the single object the whole product starts
 * from, drawn as the diagnostic-manual line art a workshop would recognise.
 *
 * Rules it is drawn to:
 *   - VECTOR, 2px stroke. Never AI photography, never an engine-bay stock
 *     photo, and none of the banned racing motifs (§5).
 *   - Amber is the ACCENT only — the plug collar, the adapter's status lamp
 *     and the live pin row. Everything structural is white at low alpha, so
 *     the illustration never competes with the severity lamps in the phone
 *     beside it, and amber keeps meaning "this is the thing you touch".
 *   - Painted on the FIXED navy hero ground, so the occluding fills that make
 *     one part sit in front of another are `fill-navy-950` (the ground
 *     itself), not a themed surface token. Draw order is therefore load
 *     bearing: port → adapter → fingers → palm, back to front.
 *   - Decorative: `aria-hidden`. The hero copy already states the fact this
 *     picture illustrates; a caption would be a new copy fact.
 *   - The only motion is the status lamp, and it lives inside
 *     `prefers-reduced-motion: no-preference` (`.im-lamp` in app.css).
 */
export function ObdIllustration({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 380 190"
      fill="none"
      aria-hidden
      className={cn("h-auto w-full", className)}
    >
      <g strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
        {/* ---- Dash underside the port is mounted in ------------------- */}
        <path
          d="M6 24h46c10 0 18 8 18 18v106c0 10-8 18-18 18H6"
          className="stroke-white/20"
        />
        <path d="M20 52h28M20 68h28" className="stroke-white/10" />

        {/* ---- OBD2 port: the 16-pin D-shaped socket ------------------- */}
        <path
          d="M70 44h112l-10 102H80z"
          className="fill-navy-950 stroke-white/30"
        />
        <path
          d="M86 60h80l-7 70H93z"
          className="fill-navy-950 stroke-white/55"
        />
        {/* Two rows of pins. The top row is amber — the live side. */}
        <path
          d="M96 82h6M110 82h6M124 82h6M138 82h6M152 82h6"
          className="stroke-brand/70"
        />
        <path
          d="M98 110h6M112 110h6M126 110h6M140 110h6M154 110h6"
          className="stroke-white/35"
        />

        {/* ---- The adapter, plugged in -------------------------------- */}
        {/* Plug collar entering the socket — amber, the contact point. */}
        <path d="M126 66h48v60h-48z" className="fill-navy-950 stroke-brand" />
        {/* Adapter body */}
        <rect
          x={168}
          y={38}
          width={136}
          height={116}
          rx={14}
          className="fill-navy-950 stroke-white/55"
        />
        {/* A backlit bezel rim along the body's top edge (motif 2). */}
        <path d="M184 50h104" className="stroke-white/25" />
        {/* Label plate: the app's data-plate material, in miniature. */}
        <rect
          x={186}
          y={100}
          width={78}
          height={38}
          rx={5}
          className="stroke-white/25"
        />
        <path
          d="M198 112h42M198 126h26"
          className="stroke-white/20"
          strokeWidth={3}
        />
        {/* Status lamp + its lead across the body. */}
        <path d="M216 76h68" className="stroke-white/20" />
        <circle
          cx={200}
          cy={76}
          r={7}
          className="im-lamp fill-brand stroke-brand"
        />

        {/* ---- The hand holding it (back to front) -------------------- */}
        {/* Palm, running off the right edge of the frame. Drawn FIRST so the
            thumb and fingers, which are filled with the ground colour, cut
            their own joints into its contour instead of being crossed by it.
            Each digit runs to the frame edge, so none has a stray cap
            floating inside the palm. */}
        <path
          d="M380 18h-56a28 28 0 0 0-28 28v98a28 28 0 0 0 28 28h56"
          className="fill-navy-950 stroke-white/45"
        />
        {/* Thumb, pressing on the adapter's top edge. */}
        <path
          d="M273 30h107v30H273a15 15 0 0 1 0-30z"
          className="fill-navy-950 stroke-white/45"
        />
        {/* Two fingers curling under the adapter. */}
        <path
          d="M268 116h112v32H268a16 16 0 0 1 0-32z"
          className="fill-navy-950 stroke-white/45"
        />
        <path
          d="M297 152h83v26h-83a13 13 0 0 1 0-26z"
          className="fill-navy-950 stroke-white/45"
        />
      </g>
    </svg>
  );
}
