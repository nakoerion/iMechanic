/**
 * The vehicle pickers' pure logic: catalog shape, type-to-filter ranking, the
 * make → model cascade, and the model-year range.
 *
 * No database, no network, no DOM — the catalog is static source, which is the
 * point of it (the "Add vehicle" form must work without any API).
 *
 * The rules these tests defend:
 *  - the catalog is curated and small, and the UI never claims otherwise;
 *  - filtering is predictable (prefix matches first) and accent-blind;
 *  - a make we don't know yields NO model suggestions rather than another
 *    make's — the form must never suggest a wrong car;
 *  - the year range starts at MIN_VEHICLE_YEAR and ends at next calendar year,
 *    newest first, which is exactly what `parseYear` in the screen accepts.
 */
import { describe, expect, it } from "vitest";
import {
  catalogMakes,
  DEFAULT_SUGGESTION_LIMIT,
  filterTerms,
  isCatalogMake,
  isListedValue,
  MAKE_ALIASES,
  maxVehicleYear,
  MAX_SUGGESTION_LIMIT,
  MIN_VEHICLE_YEAR,
  modelsForMake,
  normalizeVehicleTerm,
  resolveCatalogMake,
  VEHICLE_CATALOG,
  yearSuggestions,
} from "../src/lib/vehicle-catalog";

const makes = catalogMakes();

describe("catalog shape", () => {
  it("is a curated list, in the 40–60 make range the brief asks for", () => {
    expect(makes.length).toBeGreaterThanOrEqual(40);
    expect(makes.length).toBeLessThanOrEqual(60);
  });

  it("has no duplicate makes", () => {
    const keys = makes.map(normalizeVehicleTerm);
    expect(new Set(keys).size).toBe(makes.length);
  });

  it("gives every make at least three suggested models", () => {
    for (const entry of VEHICLE_CATALOG) {
      expect(entry.models.length).toBeGreaterThanOrEqual(3);
    }
  });

  it("has no duplicate models within a make", () => {
    for (const entry of VEHICLE_CATALOG) {
      const keys = entry.models.map(normalizeVehicleTerm);
      expect(new Set(keys).size).toBe(entry.models.length);
    }
  });

  it("keeps every name non-empty and short enough for the input (80 chars)", () => {
    for (const entry of VEHICLE_CATALOG) {
      expect(entry.make.trim()).not.toBe("");
      expect(entry.make.length).toBeLessThanOrEqual(80);
      for (const model of entry.models) {
        expect(model.trim()).not.toBe("");
        expect(model.length).toBeLessThanOrEqual(80);
      }
    }
  });

  it("covers the launch markets' common makes", () => {
    for (const expected of [
      "Volkswagen",
      "Opel",
      "Vauxhall",
      "Ford",
      "Mercedes-Benz",
      "Škoda",
      "Renault",
      "Peugeot",
      "Fiat",
      "Toyota",
    ]) {
      expect(makes).toContain(expected);
    }
  });

  it("only lists aliases for makes that exist", () => {
    for (const make of Object.keys(MAKE_ALIASES)) {
      expect(makes).toContain(make);
    }
  });
});

describe("normalizeVehicleTerm", () => {
  it("folds case and diacritics so a typed make matches our spelling", () => {
    expect(normalizeVehicleTerm("ŠKODA")).toBe("skoda");
    expect(normalizeVehicleTerm("Citroën")).toBe("citroen");
    expect(normalizeVehicleTerm("  Volkswagen  ")).toBe("volkswagen");
  });

  it("collapses punctuation and spacing", () => {
    expect(normalizeVehicleTerm("3 Series")).toBe("3 series");
    expect(normalizeVehicleTerm("X-Trail")).toBe("x trail");
    expect(normalizeVehicleTerm("Mercedes  Benz")).toBe("mercedes benz");
    expect(normalizeVehicleTerm("ID.3")).toBe("id 3");
  });

  it("returns an empty key for blank input", () => {
    expect(normalizeVehicleTerm("")).toBe("");
    expect(normalizeVehicleTerm("   ")).toBe("");
  });
});

describe("filterTerms", () => {
  const options = ["Audi", "BMW", "Ford", "Škoda", "Volkswagen"];

  it("returns the head of the list for an empty query (the 'popular' rows)", () => {
    expect(filterTerms(options, "")).toEqual(options);
    expect(filterTerms(makes, "", 3)).toEqual(makes.slice(0, 3));
  });

  it("ranks prefix matches before mere contains matches", () => {
    /* "o" prefixes Opel; Volkswagen and Ford only contain it. */
    const ranked = ["Audi", "Volkswagen", "Ford", "Opel"];
    expect(filterTerms(ranked, "o")).toEqual(["Opel", "Volkswagen", "Ford"]);
  });

  it("is case- and accent-blind", () => {
    expect(filterTerms(options, "skoda")).toEqual(["Škoda"]);
    expect(filterTerms(options, "SKODA")).toEqual(["Škoda"]);
    expect(filterTerms(options, "škod")).toEqual(["Škoda"]);
  });

  it("matches through a make's short form but shows the real name", () => {
    const filtered = filterTerms(makes, "vw", DEFAULT_SUGGESTION_LIMIT, MAKE_ALIASES);
    expect(filtered).toEqual(["Volkswagen"]);
    expect(filterTerms(makes, "mercedes", DEFAULT_SUGGESTION_LIMIT, MAKE_ALIASES)).toEqual([
      "Mercedes-Benz",
    ]);
    /* The alias is not a suggestion of its own. */
    expect(filtered).not.toContain("VW");
  });

  it("returns nothing for a query nothing matches, never a random car", () => {
    expect(filterTerms(options, "zzz")).toEqual([]);
    expect(filterTerms(makes, "zzz", DEFAULT_SUGGESTION_LIMIT, MAKE_ALIASES)).toEqual([]);
  });

  it("caps the result and never duplicates an option", () => {
    const filtered = filterTerms(makes, "a", 5);
    expect(filtered.length).toBe(5);
    expect(new Set(filtered).size).toBe(5);
  });

  it("treats a zero limit as 'show nothing'", () => {
    expect(filterTerms(makes, "", 0)).toEqual([]);
  });

  it("never mutates the list it is given", () => {
    const input = ["Audi", "BMW", "Ford"];
    filterTerms(input, "a", 2);
    expect(input).toEqual(["Audi", "BMW", "Ford"]);
  });
});

describe("make → model cascade", () => {
  it("suggests that make's models", () => {
    expect(modelsForMake("Volkswagen")).toContain("Golf");
    expect(modelsForMake("Ford")).toContain("Fiesta");
  });

  it("is case-, accent- and alias-blind", () => {
    expect(modelsForMake("volkswagen")).toContain("Golf");
    expect(modelsForMake("škoda")).toContain("Octavia");
    expect(modelsForMake("VW")).toContain("Golf");
    expect(modelsForMake("vw")).toContain("Golf");
  });

  it("offers NOTHING for a make we do not know — never another make's models", () => {
    expect(modelsForMake("")).toEqual([]);
    expect(modelsForMake("   ")).toEqual([]);
    expect(modelsForMake("Trabant")).toEqual([]);
    expect(modelsForMake("Porsche 911")).toEqual([]);
  });

  it("hands back a fresh array, so a caller cannot corrupt the catalog", () => {
    modelsForMake("Ford").push("NotAFord");
    expect(modelsForMake("Ford")).not.toContain("NotAFord");
  });

  it("never returns models belonging to a different make", () => {
    const ford = new Set(modelsForMake("Ford").map(normalizeVehicleTerm));
    for (const model of modelsForMake("Volkswagen")) {
      expect(ford.has(normalizeVehicleTerm(model))).toBe(false);
    }
  });
});

describe("isCatalogMake / resolveCatalogMake", () => {
  it("recognises a listed make however it is typed", () => {
    expect(isCatalogMake("Volkswagen")).toBe(true);
    expect(isCatalogMake("volkswagen ")).toBe(true);
    expect(isCatalogMake("VW")).toBe(true);
    expect(isCatalogMake("Škoda")).toBe(true);
    expect(isCatalogMake("skoda")).toBe(true);
  });

  it("rejects a make we don't have — the picker then lets the user type it", () => {
    expect(isCatalogMake("Trabant")).toBe(false);
    expect(isCatalogMake("")).toBe(false);
    expect(isCatalogMake("  ")).toBe(false);
  });

  it("resolves an alias to its real catalog entry", () => {
    expect(resolveCatalogMake("VW")?.make).toBe("Volkswagen");
    expect(resolveCatalogMake("Range Rover")?.make).toBe("Land Rover");
    expect(resolveCatalogMake("Trabant")).toBeNull();
  });
});

describe("isListedValue", () => {
  it("matches accent- and case-insensitively", () => {
    expect(isListedValue(["Škoda", "Ford"], "skoda")).toBe(true);
    expect(isListedValue(["Škoda", "Ford"], "  FORD ")).toBe(true);
  });

  it("treats anything else as the user's own text", () => {
    expect(isListedValue(["Škoda", "Ford"], "Porsche 911")).toBe(false);
    expect(isListedValue(["Škoda", "Ford"], "")).toBe(false);
  });
});

describe("model year range", () => {
  it("starts at the year the backend stores and ends at next calendar year", () => {
    const years = yearSuggestions(new Date("2026-06-01T12:00:00Z"));
    expect(years[0]).toBe("2027");
    expect(years[years.length - 1]).toBe(String(MIN_VEHICLE_YEAR));
    expect(years.length).toBe(2027 - MIN_VEHICLE_YEAR + 1);
  });

  it("runs newest first, without gaps or repeats", () => {
    const years = yearSuggestions(new Date("2026-06-01T12:00:00Z")).map(Number);
    for (let i = 1; i < years.length; i += 1) {
      expect(years[i]).toBe(years[i - 1] - 1);
    }
    expect(new Set(years).size).toBe(years.length);
  });

  it("agrees with the screen's own guard: maxVehicleYear is next year", () => {
    expect(maxVehicleYear(new Date("2026-12-31T23:00:00Z"))).toBe(2027);
    expect(maxVehicleYear(new Date("2027-01-01T00:00:00Z"))).toBe(2028);
  });

  it("lets a typed year narrow the list to the decade", () => {
    const years = yearSuggestions(new Date("2026-06-01T12:00:00Z"));
    /* The picker filters a typed query with MAX_SUGGESTION_LIMIT, so the whole
       decade is reachable by typing three digits. */
    expect(filterTerms(years, "199", MAX_SUGGESTION_LIMIT)).toEqual([
      "1999",
      "1998",
      "1997",
      "1996",
      "1995",
      "1994",
      "1993",
      "1992",
      "1991",
      "1990",
    ]);
    expect(filterTerms(years, "2016", MAX_SUGGESTION_LIMIT)).toEqual(["2016"]);
    expect(filterTerms(years, "16", MAX_SUGGESTION_LIMIT)).toEqual(["2016"]);
  });

  it("shows the newest years before the user types anything", () => {
    const years = yearSuggestions(new Date("2026-06-01T12:00:00Z"));
    expect(filterTerms(years, "", DEFAULT_SUGGESTION_LIMIT)).toEqual([
      "2027",
      "2026",
      "2025",
      "2024",
      "2023",
      "2022",
      "2021",
      "2020",
    ]);
  });
});
