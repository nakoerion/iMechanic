/**
 * iMechanic — a small, CURATED vehicle catalog (make → models) plus the shared
 * model-year range.
 *
 * Why it exists: the "Add vehicle" form used to be three bare text inputs, so a
 * customer staring at an empty field had no idea what to type. These lists turn
 * make and model into type-to-filter suggestions and the year into a dropdown.
 *
 * What it is NOT:
 *  - It is NOT a validation gate. The database and `createVehicle` keep accepting
 *    ANY non-empty make/model string, and every picker still lets the user type a
 *    car that is not in here ("Other — use what I typed"). Nothing is refused
 *    because it is missing from this list.
 *  - It is NOT the complete market. It is a short list of makes and models
 *    commonly seen in the launch markets (Germany, the UK, Albania). The UI says
 *    "popular"/"suggested" everywhere, never "all models".
 *  - It is NOT live data. It is static source, in the same spirit as
 *    `dtc_catalog`: a seeded, hand-checked list that ships with the app, so the
 *    form needs no network call and no API key.
 */

export type CatalogMake = {
  readonly make: string;
  readonly models: readonly string[];
};

/** The oldest model year the backend stores (see `createVehicleCore`). */
export const MIN_VEHICLE_YEAR = 1980;

/**
 * How many suggestions an unfiltered picker shows before the user types. The
 * list is scrollable; this keeps a phone-sized popup from swallowing the screen.
 */
export const DEFAULT_SUGGESTION_LIMIT = 8;

/** The ceiling for a filtered list — plenty to scroll, short enough to stay fast. */
export const MAX_SUGGESTION_LIMIT = 60;

/** Models are per-make and deliberately short: the common ones, not the full range. */
export const VEHICLE_CATALOG: readonly CatalogMake[] = [
  { make: "Abarth", models: ["500", "595", "695", "Grande Punto", "Punto Evo"] },
  {
    make: "Alfa Romeo",
    models: ["Giulietta", "Giulia", "MiTo", "147", "156", "159", "Brera", "GT", "Spider", "Stelvio", "Tonale"],
  },
  {
    make: "Audi",
    models: ["A1", "A2", "A3", "A4", "A5", "A6", "A7", "A8", "Q2", "Q3", "Q5", "Q7", "Q8", "TT", "e-tron"],
  },
  {
    make: "BMW",
    models: ["1 Series", "2 Series", "3 Series", "4 Series", "5 Series", "6 Series", "7 Series", "X1", "X2", "X3", "X4", "X5", "X6", "Z3", "Z4", "i3"],
  },
  { make: "BYD", models: ["Atto 3", "Dolphin", "Seal", "Han", "Tang"] },
  { make: "Cadillac", models: ["BLS", "CTS", "Escalade", "SRX", "ATS"] },
  {
    make: "Chevrolet",
    models: ["Aveo", "Cruze", "Captiva", "Lacetti", "Matiz", "Spark", "Kalos", "Orlando", "Trax", "Epica", "Nubira"],
  },
  { make: "Chrysler", models: ["Voyager", "Grand Voyager", "PT Cruiser", "300C", "Crossfire", "Neon", "Sebring"] },
  {
    make: "Citroën",
    models: ["C1", "C2", "C3", "C3 Aircross", "C4", "C4 Cactus", "C4 Picasso", "C5", "C5 Aircross", "C8", "Berlingo", "Xsara", "Saxo", "Xantia", "Jumpy", "Jumper", "DS3", "DS4", "DS5"],
  },
  { make: "Cupra", models: ["Leon", "Formentor", "Ateca", "Born", "Tavascan", "Terramar"] },
  { make: "Dacia", models: ["Sandero", "Logan", "Duster", "Lodgy", "Dokker", "Jogger", "Spring"] },
  { make: "Daewoo", models: ["Lanos", "Nubira", "Matiz", "Leganza", "Kalos", "Espero", "Tacuma"] },
  { make: "Daihatsu", models: ["Cuore", "Sirion", "Terios", "YRV", "Materia", "Charade", "Move"] },
  { make: "Dodge", models: ["Caliber", "Journey", "Nitro", "Avenger", "Charger", "Challenger", "Durango", "Ram"] },
  {
    make: "Fiat",
    models: ["500", "500X", "500L", "Panda", "Punto", "Grande Punto", "Bravo", "Brava", "Stilo", "Tipo", "Idea", "Doblo", "Ducato", "Croma", "Marea", "Seicento", "Qubo", "Freemont"],
  },
  {
    make: "Ford",
    models: ["Fiesta", "Focus", "Mondeo", "Kuga", "Puma", "EcoSport", "Galaxy", "S-Max", "C-Max", "B-Max", "Ka", "Fusion", "Escort", "Sierra", "Transit", "Transit Custom", "Ranger", "Mustang", "Explorer", "F-150"],
  },
  { make: "Genesis", models: ["G70", "G80", "GV70", "GV80"] },
  { make: "Honda", models: ["Civic", "Accord", "Jazz", "CR-V", "HR-V", "City", "Insight", "FR-V", "Stream", "Prelude"] },
  {
    make: "Hyundai",
    models: ["i10", "i20", "i30", "i40", "ix20", "ix35", "Tucson", "Santa Fe", "Kona", "Getz", "Accent", "Matrix", "Coupe", "Bayon"],
  },
  { make: "Infiniti", models: ["Q30", "Q50", "QX30", "EX", "FX", "G37"] },
  { make: "Isuzu", models: ["D-Max", "Trooper", "Rodeo"] },
  { make: "Iveco", models: ["Daily", "Eurocargo", "Stralis", "Trakker"] },
  { make: "Jaguar", models: ["X-Type", "S-Type", "XF", "XE", "XJ", "XK", "F-Pace", "F-Type", "E-Pace", "I-Pace"] },
  { make: "Jeep", models: ["Renegade", "Compass", "Cherokee", "Grand Cherokee", "Wrangler", "Patriot"] },
  {
    make: "Kia",
    models: ["Picanto", "Rio", "Ceed", "Sportage", "Sorento", "Soul", "Stonic", "Niro", "Venga", "Carens", "Optima", "Carnival", "XCeed"],
  },
  { make: "Lada", models: ["Niva", "4x4", "Granta", "Vesta", "Kalina", "Priora", "2110", "Samara", "2107"] },
  { make: "Lancia", models: ["Ypsilon", "Delta", "Musa", "Phedra", "Thesis", "Lybra", "Dedra"] },
  {
    make: "Land Rover",
    models: ["Defender", "Discovery", "Discovery Sport", "Freelander", "Range Rover", "Range Rover Evoque", "Range Rover Sport", "Range Rover Velar"],
  },
  { make: "Lexus", models: ["IS", "ES", "GS", "LS", "RX", "NX", "CT", "UX", "LX"] },
  { make: "Mazda", models: ["2", "3", "5", "6", "MX-5", "CX-3", "CX-5", "CX-30", "CX-7", "CX-60", "Premacy", "Tribute", "323", "626"] },
  {
    make: "Mercedes-Benz",
    models: ["A-Class", "B-Class", "C-Class", "E-Class", "S-Class", "CLA", "CLK", "CLS", "GLA", "GLB", "GLC", "GLE", "ML", "Sprinter", "Vito", "V-Class"],
  },
  { make: "MG", models: ["ZR", "ZS", "ZT", "MG3", "MG4", "MG5", "HS", "ZS EV", "MGB", "TF"] },
  { make: "Mini", models: ["One", "Cooper", "Cooper S", "Clubman", "Countryman", "Cabrio", "Paceman", "Electric"] },
  { make: "Mitsubishi", models: ["Colt", "Lancer", "Space Star", "Outlander", "ASX", "Pajero", "L200", "Carisma", "Grandis", "Eclipse Cross", "Mirage"] },
  {
    make: "Nissan",
    models: ["Micra", "Note", "Almera", "Primera", "Qashqai", "Juke", "X-Trail", "Navara", "Pulsar", "Leaf", "Terrano", "Pathfinder", "350Z", "370Z", "Sunny"],
  },
  {
    make: "Opel",
    models: ["Astra", "Corsa", "Insignia", "Vectra", "Zafira", "Meriva", "Mokka", "Adam", "Karl", "Cascada", "Tigra", "Combo", "Vivaro", "Omega", "Crossland", "Grandland"],
  },
  {
    make: "Peugeot",
    models: ["106", "107", "108", "206", "207", "208", "306", "307", "308", "406", "407", "508", "2008", "3008", "5008", "Partner", "Expert", "Boxer", "RCZ", "Traveller"],
  },
  { make: "Polestar", models: ["Polestar 2", "Polestar 3", "Polestar 4"] },
  { make: "Porsche", models: ["911", "Boxster", "Cayman", "Cayenne", "Macan", "Panamera", "Taycan", "924", "944", "968"] },
  {
    make: "Renault",
    models: ["Clio", "Captur", "Megane", "Scenic", "Talisman", "Kadjar", "Koleos", "Twingo", "Laguna", "Espace", "Kangoo", "Trafic", "Master", "Zoe", "Modus", "Fluence"],
  },
  { make: "Rover", models: ["25", "45", "75", "200", "400", "600", "800", "Metro"] },
  { make: "Saab", models: ["9-3", "9-5", "900", "9000"] },
  { make: "Seat", models: ["Ibiza", "Leon", "Toledo", "Altea", "Arosa", "Cordoba", "Ateca", "Arona", "Tarraco", "Alhambra", "Mii", "Exeo"] },
  { make: "Škoda", models: ["Fabia", "Octavia", "Superb", "Roomster", "Yeti", "Kodiaq", "Karoq", "Kamiq", "Scala", "Citigo", "Rapid", "Felicia", "Enyaq"] },
  { make: "Smart", models: ["Fortwo", "Forfour", "Roadster"] },
  { make: "SsangYong", models: ["Korando", "Rexton", "Tivoli", "Rodius", "Kyron", "Actyon"] },
  { make: "Subaru", models: ["Impreza", "Legacy", "Forester", "Outback", "XV", "Justy", "BRZ", "Tribeca", "Levorg"] },
  { make: "Suzuki", models: ["Alto", "Swift", "Ignis", "Baleno", "Vitara", "SX4", "Jimny", "Splash", "Liana", "Wagon R", "Celerio", "Grand Vitara"] },
  { make: "Tesla", models: ["Model 3", "Model S", "Model X", "Model Y"] },
  {
    make: "Toyota",
    models: ["Aygo", "Yaris", "Yaris Cross", "Corolla", "Auris", "Avensis", "Camry", "Prius", "C-HR", "RAV4", "Land Cruiser", "Hilux", "Verso", "Corolla Verso", "Urban Cruiser", "Supra", "GT86"],
  },
  {
    make: "Vauxhall",
    models: ["Astra", "Corsa", "Corsa-e", "Insignia", "Vectra", "Zafira", "Meriva", "Mokka", "Adam", "Crossland", "Grandland", "Vivaro", "Combo"],
  },
  {
    make: "Volkswagen",
    models: ["Polo", "Golf", "Golf Plus", "Passat", "Passat Variant", "Tiguan", "Touran", "Touareg", "Sharan", "Arteon", "Caddy", "T-Cross", "T-Roc", "Up!", "Scirocco", "Jetta", "Bora", "Beetle", "Lupo", "Transporter", "Amarok", "ID.3", "ID.4"],
  },
  { make: "Volvo", models: ["V40", "V50", "V60", "V70", "S40", "S60", "S80", "S90", "XC40", "XC60", "XC70", "XC90", "C30", "240", "740", "850"] },
];

/**
 * Comparison key for user-typed text: lowercased, diacritics folded (Škoda →
 * skoda, Citroën → citroen), punctuation and spacing collapsed. So "skoda",
 * "ŠKODA" and "Skoda " all match the catalog entry "Škoda", and "3 series"
 * matches "3 Series".
 */
export function normalizeVehicleTerm(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/**
 * Short forms people actually type for a make, keyed by the catalog's spelling.
 * They are SEARCH terms only — never displayed, never stored. So typing "vw"
 * suggests "Volkswagen", and picking or typing "VW" still offers Volkswagen's
 * models, while the saved value stays whatever the user chose.
 */
export const MAKE_ALIASES: Readonly<Record<string, readonly string[]>> = {
  Volkswagen: ["VW"],
  "Mercedes-Benz": ["Mercedes", "Mercedes Benz", "Benz"],
  "Škoda": ["Skoda"],
  "Citroën": ["Citroen"],
  "Alfa Romeo": ["Alfa", "Alfa-Romeo"],
  "Land Rover": ["Range Rover"],
  SsangYong: ["Ssang Yong"],
  Chevrolet: ["Chevy"],
};

/** The catalog makes, in the order they are shown (alphabetical by spelling). */
export function catalogMakes(): string[] {
  return VEHICLE_CATALOG.map((entry) => entry.make);
}

/**
 * The catalog entry for what the user typed, matched case- and
 * accent-insensitively on the make's name or one of its short forms
 * (see MAKE_ALIASES). `null` when the make simply isn't in our list — which is
 * not an error: the pickers let the user type it anyway.
 */
export function resolveCatalogMake(term: string): CatalogMake | null {
  const key = normalizeVehicleTerm(term);
  if (key === "") return null;
  const direct = VEHICLE_CATALOG.find(
    (entry) => normalizeVehicleTerm(entry.make) === key,
  );
  if (direct) return direct;
  const aliased = VEHICLE_CATALOG.find((entry) =>
    (MAKE_ALIASES[entry.make] ?? []).some(
      (alias) => normalizeVehicleTerm(alias) === key,
    ),
  );
  return aliased ?? null;
}

/** Is this make one of ours (by name or short form)? */
export function isCatalogMake(term: string): boolean {
  return resolveCatalogMake(term) !== null;
}

/**
 * The models suggested for a make. An unknown make (the user typed their own,
 * or nothing yet) yields an empty list — the picker then says so and the user
 * types freely; it never falls back to another make's models.
 */
export function modelsForMake(make: string): string[] {
  const entry = resolveCatalogMake(make);
  return entry ? [...entry.models] : [];
}

/**
 * Filter a list of terms for a type-to-filter picker.
 *
 * Ranking is deliberately simple and predictable: terms that START WITH the
 * query come first (in the list's own order), then terms that merely contain it.
 * A term also matches through its short forms (`aliases`), so "vw" finds
 * "Volkswagen" — but the alias is never shown, only the real name. Duplicates are
 * impossible (a term can only match once). An empty query returns the head of the
 * list — the "popular" suggestions — capped at `limit`.
 */
export function filterTerms(
  options: readonly string[],
  query: string,
  limit: number = DEFAULT_SUGGESTION_LIMIT,
  aliases: Readonly<Record<string, readonly string[]>> = {},
): string[] {
  const cap = Math.max(0, limit);
  if (cap === 0) return [];
  const key = normalizeVehicleTerm(query);
  if (key === "") return options.slice(0, cap);

  const starts: string[] = [];
  const contains: string[] = [];
  for (const option of options) {
    const keys = [
      normalizeVehicleTerm(option),
      ...(aliases[option] ?? []).map(normalizeVehicleTerm),
    ];
    if (keys.some((k) => k.startsWith(key))) {
      starts.push(option);
      if (starts.length >= cap) break;
    } else if (keys.some((k) => k.includes(key))) {
      contains.push(option);
    }
  }
  return [...starts, ...contains].slice(0, cap);
}

/** True when `value` is one of `options`, compared accent- and case-insensitively. */
export function isListedValue(options: readonly string[], value: string): boolean {
  const key = normalizeVehicleTerm(value);
  return key !== "" && options.some((option) => normalizeVehicleTerm(option) === key);
}

/**
 * The newest model year the backend accepts: next calendar year.
 *
 * The calendar is read in **UTC**, never the runtime's local zone. `getFullYear()`
 * is a property of the runtime, not of the instant: on 2026-12-31T23:30Z a server
 * in UTC still says 2026 while a browser in Berlin (UTC+1) already says 2027, so
 * the two would disagree about the newest offered year (`…+1` = 2027 vs 2028) —
 * a hydration mismatch (React #418) the moment the picker is server-rendered, and
 * worse, the browser would offer a year the backend then refuses. Reading the
 * instant in UTC makes both runtimes derive the same year from the same clock.
 */
export function maxVehicleYear(now: Date = new Date()): number {
  return now.getUTCFullYear() + 1;
}

/**
 * Every selectable model year, newest first, as strings — `maxVehicleYear()`
 * down to `MIN_VEHICLE_YEAR`. Strings because the picker is a text field: the
 * user can always type a year and the numeric guard (`parseYear`) still decides
 * whether it is kept. Filtered for display by `filterTerms`, so typing "199"
 * jumps to the 1990s and "16" finds 2016.
 */
export function yearSuggestions(now: Date = new Date()): string[] {
  const newest = maxVehicleYear(now);
  const years: string[] = [];
  for (let year = newest; year >= MIN_VEHICLE_YEAR; year -= 1) {
    years.push(String(year));
  }
  return years;
}
