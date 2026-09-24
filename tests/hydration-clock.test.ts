/**
 * The two residual hydration edges of the #418 sweep: renders whose text comes
 * from a *clock* rather than from data.
 *
 * React compares the server's HTML with the client's first render. Anything the
 * two runtimes derive from data agrees; anything derived from the wall clock or
 * from the runtime's time zone can disagree, and React then throws the whole SSR
 * tree away (error #418). There are exactly two such renders in the app:
 *
 *  1. `formatWhen` on /app/history — "3 min ago" is measured against *whose*
 *     clock. Server and browser can straddle a minute boundary, so the two
 *     strings legitimately differ and the element is hydration-suppressed.
 *  2. The model-year suggestions in the Add-vehicle picker — the newest offered
 *     year is `year + 1`, read from a `Date`. Reading that year in the runtime's
 *     local zone makes a browser in Berlin (UTC+1) disagree with a UTC server
 *     for the last hour of every 31 December.
 *
 * Case 2 is fixed at the source (`maxVehicleYear` reads UTC), so it is tested
 * behaviourally here: the divergence is reproduced by moving the runtime's zone
 * and the test asserts the two runtimes now agree. Case 1 *cannot* be made equal
 * (that is what a relative clock is), so it is pinned by a source contract — the
 * relative text must stay suppressed, its absolute branch must stay pinned to a
 * fixed locale and zone, and no other module may read the local calendar year.
 *
 * (No DOM/JSDOM dependency is available in this repo — `react-dom/server` alone
 * cannot hydrate, and adding a full DOM environment for one assertion is not
 * worth the install on this machine — hence the split between the behavioural
 * test and the source contract.)
 */
import { readFileSync, readdirSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { maxVehicleYear, yearSuggestions } from "../src/lib/vehicle-catalog";

const read = (relative: string) =>
  readFileSync(new URL(relative, import.meta.url), "utf8");

/** Every `.ts`/`.tsx` file under `src/`, as [path, text] pairs. */
function srcFiles(dir = new URL("../src/", import.meta.url)): [string, string][] {
  const out: [string, string][] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const child = new URL(entry.name + (entry.isDirectory() ? "/" : ""), dir);
    if (entry.isDirectory()) out.push(...srcFiles(child));
    else if (/\.tsx?$/.test(entry.name)) out.push([entry.name, readFileSync(child, "utf8")]);
  }
  return out;
}

/* ------------------------------------------------------------------ case 1 */

describe("history's relative timestamp is hydration-suppressed", () => {
  const history = read("../src/routes/app/history.tsx");

  it("keeps the relative label suppressed, never deferred out of the first paint", () => {
    const timeElement = history.match(/<time[\s\S]*?<\/time>/)?.[0] ?? "";
    expect(timeElement).toContain("formatWhen(");
    expect(timeElement).toContain("suppressHydrationWarning");
    /* SSR content stays real: React is told to tolerate the difference rather
       than the label being withheld until after mount. */
    expect(timeElement).toContain("dateTime={scan.createdAt}");
  });

  it("formats anything older than a week with a pinned locale and zone", () => {
    /* The absolute branch is the one that CAN be made deterministic, so it must
       stay pinned — an undefined locale/zone differs between server and browser
       for every non-US reader. */
    const fn = history.match(/function formatWhen[\s\S]*?\n}/)?.[0] ?? "";
    expect(fn).toContain('toLocaleDateString("en-US"');
    expect(fn).toContain('timeZone: "UTC"');
  });

  it("leaves no other module reading the local calendar year", () => {
    /* The sweep is complete only while the year a runtime derives from its own
       zone cannot reach a rendered string or an acceptance check. Comments are
       stripped first: naming the trap in prose is how the next reader avoids it,
       so a comment that mentions it must not fail the guard. */
    const withoutComments = (text: string) =>
      text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/[ \t]*\/\/.*$/gm, "");
    const offenders = srcFiles()
      .filter(([, text]) => withoutComments(text).includes("getFullYear()"))
      .map(([name]) => name);
    expect(offenders).toEqual([]);
  });
});

/* ------------------------------------------------------------------ case 2 */

describe("model-year suggestions agree across runtimes (no #418 at New Year)", () => {
  const originalTz = process.env.TZ;

  beforeEach(() => {
    /* The instant every runtime agrees on: 2026-12-31T23:30:00Z. UTC is still in
       2026 while Kiribati (UTC+14) is already in 2027. */
    process.env.TZ = "UTC";
  });

  afterEach(() => {
    if (originalTz === undefined) delete process.env.TZ;
    else process.env.TZ = originalTz;
  });

  it("offers the same newest year in the server's zone and in a zone ahead of it", () => {
    const instant = new Date("2026-12-31T23:30:00Z");
    const onServer = maxVehicleYear(instant);
    const serverList = yearSuggestions(instant);

    process.env.TZ = "Pacific/Kiritimati"; // UTC+14
    /* The local calendar really has rolled over — this is the old bug's trigger
       (`getFullYear()` said 2027 here and 2026 on the server, so the browser
       offered 2028 while the backend accepted 2027 and dropped the year). */
    expect(instant.getFullYear()).toBe(2027);
    expect(maxVehicleYear(instant)).toBe(onServer);
    expect(yearSuggestions(instant)).toEqual(serverList);
  });

  it("offers the same newest year in a zone behind UTC too", () => {
    const instant = new Date("2027-01-01T02:00:00Z");
    const onServer = maxVehicleYear(instant);

    process.env.TZ = "America/New_York"; // UTC-5, still 2026 locally
    expect(instant.getFullYear()).toBe(2026);
    expect(maxVehicleYear(instant)).toBe(onServer);
  });

  it("still means 'next calendar year' in UTC for its own sake", () => {
    /* The guard's contract, unchanged: the app accepts next year's models. */
    expect(maxVehicleYear(new Date("2026-12-31T23:59:59Z"))).toBe(2027);
    expect(maxVehicleYear(new Date("2027-01-01T00:00:00Z"))).toBe(2028);
  });
});
