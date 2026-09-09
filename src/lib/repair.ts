/**
 * S5 Act — guided-repair step library.
 *
 * Pure and client-safe: no Node builtins, no server imports. A starter
 * library of general guidance per repair family, NOT vehicle-specific
 * repair data. Steps are ordered, checkable, carry a tools list and a
 * time estimate, and are written to be honest: no torque specs, no part
 * numbers, no "this will fix it" promises. Where a family involves real
 * danger (hot coolant, fuel vapour, high current, supporting the car) the
 * family carries a `safetyNote` and risky steps say so in-line.
 *
 * REPAIR_GUIDANCE_NOTE must be rendered with every guide: these steps are
 * general guidance, not a workshop manual for the owner's car. If they are
 * unsure at any point, a workshop is the right answer.
 */

import type { RepairFamily } from "./cost";
import { REPAIR_FAMILIES } from "./cost";

export type RepairStep = {
  title: string;
  body: string;
  tools: string[];
  estMinutes: number;
};

export type RepairGuide = {
  family: RepairFamily;
  /** Plain-English name for headings ("Ignition — spark plugs and coils"). */
  title: string;
  /** Shown whenever the family involves real danger; null only when no
   *  step in the family is hazardous (never for fuel/electrical/heat). */
  safetyNote: string | null;
  steps: RepairStep[];
};

/**
 * General guidance, not a workshop manual — the UI must show this with
 * every repair guide, alongside COST_ESTIMATE_NOTE on the Decide card.
 */
export const REPAIR_GUIDANCE_NOTE =
  "General guidance for this repair area, not instructions for your exact car. Steps and difficulty differ by model — if anything looks different under your bonnet, stop and ask a workshop.";

const GUIDES: Record<RepairFamily, RepairGuide> = {
  ignition: {
    family: "ignition",
    title: "Ignition — spark plugs and ignition coils",
    safetyNote:
      "Work on a cold engine with the ignition off. Disconnect the battery negative terminal before touching coils or plugs.",
    steps: [
      {
        title: "Confirm which cylinder is misfiring",
        body: "Match the fault code to its cylinder (P0301 is cylinder 1, P0302 is cylinder 2, and so on; P0300 means random or multiple cylinders). Note it down — everything else follows from this.",
        tools: ["Your scan readout"],
        estMinutes: 5,
      },
      {
        title: "Inspect the coil and plug visually",
        body: "With the engine cold and the battery disconnected, unplug the coil connector on the misfiring cylinder and remove the coil. Look for cracks, burn marks, oil in the plug well, or a plug fouled with oil or carbon. Oil in the well points at a leaking seal, not a bad coil.",
        tools: ["Socket set", "Torch"],
        estMinutes: 20,
      },
      {
        title: "Swap the coil to a healthy cylinder",
        body: "Move the suspect coil to a cylinder that reads clean, refit everything, reconnect the battery, clear the codes and drive a short test loop. If the misfire code follows the coil to its new cylinder, the coil is faulty. If it stays put, suspect the plug, injector or compression on the original cylinder.",
        tools: ["Socket set", "OBD2 adapter"],
        estMinutes: 30,
      },
      {
        title: "Replace the faulty plug or coil",
        body: "Replace the confirmed faulty part with the correct type for your car — check the owner's manual or a parts catalogue, never guess. Replace plugs as a full set if they are old; coils can be replaced singly.",
        tools: ["Socket set", "Spark plug socket", "Replacement plug or coil"],
        estMinutes: 30,
      },
      {
        title: "Clear the codes and re-scan",
        body: "Clear the codes, drive normally for a day, then re-scan. If the misfire code is gone, the job is done. If it returns, stop replacing parts and book a workshop — persistent misfires can mean injector or compression faults.",
        tools: ["OBD2 adapter"],
        estMinutes: 10,
      },
    ],
  },
  oxygen_sensor: {
    family: "oxygen_sensor",
    title: "Oxygen (lambda) sensor",
    safetyNote:
      "Work on a cold exhaust — sensors sit in the exhaust stream and stay hot long after driving. Disconnect the battery before unplugging the sensor.",
    steps: [
      {
        title: "Find which sensor the code names",
        body: "Bank 1 is the side with cylinder 1; sensor 1 sits before the catalytic converter, sensor 2 after it. The code (for example P0133) tells you exactly which one — replace the named sensor, not its neighbour.",
        tools: ["Your scan readout", "Owner's manual"],
        estMinutes: 10,
      },
      {
        title: "Check the wiring first",
        body: "Follow the sensor's cable from the exhaust to its connector. Look for melted insulation, chafing where it touches hot or moving parts, and a loose or corroded connector. Many sensor codes are wiring faults, and wiring is cheaper than a sensor.",
        tools: ["Torch", "Car ramps or jack + axle stands"],
        estMinutes: 20,
      },
      {
        title: "Look for causes upstream",
        body: "A sensor code does not always mean a dead sensor: exhaust leaks before the sensor, a failing converter, or a rich/lean running fault can all set one. If the exhaust blows audibly or another fuelling code is present, fix that first.",
        tools: ["Torch"],
        estMinutes: 15,
      },
      {
        title: "Replace the sensor",
        body: "With the exhaust cold, unplug the connector, unscrew the old sensor with an oxygen-sensor socket, and fit the correct replacement for your car — sensor types are not interchangeable. Route the cable exactly as the old one ran, clear of hot and moving parts.",
        tools: ["Oxygen-sensor socket", "Penetrating oil", "Replacement sensor"],
        estMinutes: 45,
      },
      {
        title: "Clear the codes and re-scan",
        body: "Clear the codes and drive a few mixed trips so the sensor's monitor can re-run, then re-scan. If the code returns, the fault is upstream — book a workshop rather than replacing more sensors.",
        tools: ["OBD2 adapter"],
        estMinutes: 10,
      },
    ],
  },
  catalyst: {
    family: "catalyst",
    title: "Catalytic converter efficiency",
    safetyNote:
      "Never replace a catalytic converter while a misfire or fuelling fault is active — unburnt fuel will destroy the new converter within days. Fix ignition and fuelling first. The exhaust runs extremely hot; work cold.",
    steps: [
      {
        title: "Rule out a misfire first",
        body: "Check the scan for any misfire code (P0300–P0308). If one is present — stored or pending — stop here and work the ignition guide first. A new converter under an active misfire is money burned.",
        tools: ["Your scan readout"],
        estMinutes: 5,
      },
      {
        title: "Rule out the cheap causes",
        body: "Exhaust leaks before the converter, a lazy downstream oxygen sensor, or oil/coolant contamination can all mimic a dead converter. Listen for blowing at the joints, check for sensor codes, and check whether the engine uses oil or coolant.",
        tools: ["Torch"],
        estMinutes: 20,
      },
      {
        title: "Compare the two sensor readings",
        body: "If your adapter shows live data, compare the upstream and downstream oxygen sensors at a steady cruise: a healthy converter makes the downstream signal lazy and flat while the upstream switches. If both switch together, the converter is genuinely not storing oxygen.",
        tools: ["OBD2 adapter with live data"],
        estMinutes: 20,
      },
      {
        title: "Get a workshop quote for replacement",
        body: "Converter replacement usually means cutting or unbolting exhaust sections, often seized, and the part must be the correct type-approval for your car and market. Collect two written quotes from independent workshops and confirm the correct converter type for your car and market against your VIN before authorising anything.",
        tools: ["Phone", "Vehicle registration document"],
        estMinutes: 30,
      },
      {
        title: "Clear the codes and re-scan after the repair",
        body: "After the replacement, clear the codes, drive a few mixed trips so the catalyst monitor re-runs, then re-scan. The efficiency code should be gone and stay gone.",
        tools: ["OBD2 adapter"],
        estMinutes: 10,
      },
    ],
  },
  evap: {
    family: "evap",
    title: "EVAP system — fuel vapour leaks",
    safetyNote:
      "You are working around fuel vapour. No smoking, no open flames, work outdoors or ventilated. Never open the fuel system near hot parts.",
    steps: [
      {
        title: "Check the fuel cap first",
        body: "A loose, cracked or missing fuel cap is the single most common EVAP code cause. Remove it, inspect the seal, refit it until it clicks, clear the code and drive a few trips. Many P0442-class codes never come back after this.",
        tools: ["None"],
        estMinutes: 5,
      },
      {
        title: "Look for cracked or loose hoses",
        body: "Trace the vapour hoses from the fuel tank area to the engine bay purge valve. Look for cracked rubber, perished elbows, and hoses knocked off their fittings. Refit or replace damaged sections with fuel-vapour-rated hose.",
        tools: ["Torch"],
        estMinutes: 20,
      },
      {
        title: "Test the purge valve",
        body: "Find the canister purge valve (usually on or near the intake). With the engine off it should be closed — if you can blow through it, it is stuck open and needs replacing. A valve stuck open also causes rough idle after refuelling.",
        tools: ["Basic hand tools"],
        estMinutes: 20,
      },
      {
        title: "Replace the faulty part",
        body: "Fuel cap, hose section, or purge valve — replace whichever step above convicted, with the correct part for your car. Clear the code afterwards.",
        tools: ["Basic hand tools", "Replacement part"],
        estMinutes: 25,
      },
      {
        title: "Clear the codes and re-scan",
        body: "EVAP monitors run slowly — clear the code, drive normally for several days including cold starts, then re-scan. If the code returns, the leak needs a workshop smoke test to find.",
        tools: ["OBD2 adapter"],
        estMinutes: 10,
      },
    ],
  },
  cooling: {
    family: "cooling",
    title: "Cooling system — thermostat and coolant temperature",
    safetyNote:
      "Never open the cooling system on a hot engine — coolant is pressurised near boiling point and causes severe burns. Let the engine cool fully (cold to the touch) before touching any hose or cap.",
    steps: [
      {
        title: "Check the coolant level cold",
        body: "With the engine fully cold, check the expansion-tank level against its marks. Low coolant alone can set temperature codes and must be topped up with the correct specification before anything else. Repeated low level means a leak to find.",
        tools: ["Torch", "Correct-spec coolant"],
        estMinutes: 10,
      },
      {
        title: "Watch the warm-up behaviour",
        body: "Start from cold and watch the temperature gauge: a thermostat stuck open keeps the needle low and the heater lukewarm (classic P0128); overheating or wild swings point elsewhere. Note what you see — it tells the workshop exactly where to look.",
        tools: ["None"],
        estMinutes: 15,
      },
      {
        title: "Inspect the sensor wiring",
        body: "For coolant-circuit codes, find the coolant temperature sensor (usually near the thermostat housing) and check its connector for corrosion and its cable for damage. A bad connection reads as a bad sensor.",
        tools: ["Torch"],
        estMinutes: 15,
      },
      {
        title: "Decide DIY or workshop",
        body: "Thermostat and sensor replacement is moderate DIY on many cars but involves draining coolant and bleeding air from the system — get it wrong and the engine overheats. If you have never bled a cooling system, this is a fair-priced workshop job; ask for the thermostat, gasket and a coolant change quoted together.",
        tools: ["Phone", "Owner's manual"],
        estMinutes: 15,
      },
      {
        title: "Clear the codes and re-scan",
        body: "After the repair, clear the code, drive through a full warm-up cycle, and re-scan. The temperature code should be gone and the gauge should behave normally.",
        tools: ["OBD2 adapter"],
        estMinutes: 10,
      },
    ],
  },
  airflow: {
    family: "airflow",
    title: "Air intake — MAF sensor and intake leaks",
    safetyNote:
      "Work with the engine off. MAF sensor elements are fragile — never touch the sensing wires and never use aggressive solvents on them.",
    steps: [
      {
        title: "Inspect the intake for leaks",
        body: "Unmetered air is the most common cause of lean codes. With the engine off, trace the intake trunking from the airbox to the throttle body — squeeze every rubber boot and elbow, looking for splits, loose clamps and hoses knocked off. Hiss on idle also gives it away.",
        tools: ["Torch", "Screwdriver"],
        estMinutes: 20,
      },
      {
        title: "Check the air filter and box",
        body: "Open the airbox: a collapsed, soaked or long-overdue filter starves the sensor of clean air. Replace it if it is dirty — it is cheap maintenance regardless of the code.",
        tools: ["Basic hand tools", "Replacement air filter"],
        estMinutes: 15,
      },
      {
        title: "Clean the MAF sensor",
        body: "If the codes name the mass airflow sensor, remove it and spray the sensing element with dedicated MAF cleaner only — from a distance, both sides, then let it air-dry fully before refitting. Never touch the wires, never use brake or carb cleaner.",
        tools: ["Screwdriver", "MAF sensor cleaner"],
        estMinutes: 20,
      },
      {
        title: "Replace the sensor if cleaning fails",
        body: "Clear the codes after cleaning and drive a few trips. If the code returns, the sensor is likely worn — replace it with the correct part for your car and clear the codes again.",
        tools: ["Screwdriver", "Replacement MAF sensor"],
        estMinutes: 25,
      },
      {
        title: "Re-scan to confirm",
        body: "Fuel-trim monitors need a few mixed trips to settle. Drive normally for a few days, then re-scan — the lean/rich or MAF code should be gone. If it persists, suspect fuel delivery or a hidden leak and book a workshop.",
        tools: ["OBD2 adapter"],
        estMinutes: 10,
      },
    ],
  },
  egr: {
    family: "egr",
    title: "EGR valve — exhaust gas recirculation",
    safetyNote:
      "Work on a cold engine — the EGR valve handles hot exhaust gas. Carbon deposits are sooty and messy; wear gloves. Diesels clog far more than petrol cars.",
    steps: [
      {
        title: "Note the symptoms",
        body: "EGR faults usually bring rough idle, hesitation, excess smoke (diesel) or the car entering limp mode. Note which you have — carbon-choked valves hesitate, failed position sensors throw codes with fewer symptoms.",
        tools: ["None"],
        estMinutes: 5,
      },
      {
        title: "Inspect and clean the valve",
        body: "With the engine cold and the battery disconnected, remove the EGR valve and inspect for carbon build-up. Clean accessible deposits with EGR cleaner and a soft brush. If the valve is seized solid or its diaphragm is torn, cleaning will not save it.",
        tools: ["Socket set", "EGR cleaner", "Gloves"],
        estMinutes: 45,
      },
      {
        title: "Check the passages and hoses",
        body: "While the valve is off, check the passages it feeds and its vacuum or electrical connections. Blocked passages re-clog a cleaned valve; cracked vacuum hoses mimic valve faults cheaply.",
        tools: ["Torch"],
        estMinutes: 15,
      },
      {
        title: "Replace if cleaning fails",
        body: "Refit, reconnect the battery, clear the code and drive a few trips. If the code returns or the valve was seized, replace it with the correct part for your car — and on a diesel, ask about an intake carbon clean at the same time.",
        tools: ["Socket set", "Replacement EGR valve"],
        estMinutes: 45,
      },
      {
        title: "Clear the codes and re-scan",
        body: "Clear the code and drive mixed trips so the EGR monitor re-runs, then re-scan. A returning code after replacement means wiring or control faults — workshop territory.",
        tools: ["OBD2 adapter"],
        estMinutes: 10,
      },
    ],
  },
  charging: {
    family: "charging",
    title: "Charging system — battery and alternator",
    safetyNote:
      "Batteries hold a lot of energy: remove metal jewellery, never short the terminals, and connect jump leads in the correct order. Disconnect the negative terminal first, reconnect it last.",
    steps: [
      {
        title: "Check the obvious: terminals and belt",
        body: "With the engine off, look at the battery terminals — white or green crust, looseness or corrosion all cause charging codes. Check the auxiliary belt for cracks or slack. Clean and tighten the terminals; a wire brush and ten minutes fix a surprising share of voltage faults.",
        tools: ["Wire brush", "Spanner"],
        estMinutes: 15,
      },
      {
        title: "Measure the battery at rest",
        body: "With the engine off for at least an hour, measure across the terminals with a multimeter: around 12.6 V is healthy, under 12.0 V is flat or dying. If it is simply flat, charge it fully before condemning anything.",
        tools: ["Multimeter", "Battery charger"],
        estMinutes: 15,
      },
      {
        title: "Measure charging with the engine running",
        body: "Start the engine and measure again: 13.8–14.4 V means the alternator is working; at or below battery voltage means it is not charging. Rev gently to 2000 rpm — the reading should stay stable, not sag.",
        tools: ["Multimeter"],
        estMinutes: 10,
      },
      {
        title: "Replace battery or book the alternator",
        body: "A failed battery is fair DIY — swap like-for-like (same size, capacity and terminal layout), negative off first and on last. A failed alternator is usually a workshop job: get a written quote and ask whether the belt and tensioner should be done with it.",
        tools: ["Spanner", "Replacement battery"],
        estMinutes: 30,
      },
      {
        title: "Clear the codes and re-scan",
        body: "Clear the voltage codes after the fix and drive a few trips, then re-scan. If charging codes return with a good battery and alternator, suspect wiring or a parasitic drain — book a workshop.",
        tools: ["OBD2 adapter"],
        estMinutes: 10,
      },
    ],
  },
  throttle_idle: {
    family: "throttle_idle",
    title: "Throttle body and idle control",
    safetyNote:
      "Work with the engine off and the key out — a throttle plate can snap shut with enough force to injure fingers. Disconnect the battery before cleaning.",
    steps: [
      {
        title: "Note the idle symptoms",
        body: "Carbon around the throttle plate causes hunting idle, stalling at junctions, or a sticky pedal. Note exactly when it happens (cold, warm, with air-con on) — the pattern distinguishes a dirty plate from a failed actuator.",
        tools: ["None"],
        estMinutes: 5,
      },
      {
        title: "Inspect the throttle plate",
        body: "With the engine off and the battery disconnected, remove the intake trunking at the throttle body and look at the plate: a ring of black carbon around its edge is the classic cause. Check the trunking itself for splits while it is off.",
        tools: ["Screwdriver", "Torch"],
        estMinutes: 20,
      },
      {
        title: "Clean the plate and bore",
        body: "Hold the plate open gently, spray throttle-body cleaner on a lint-free cloth (not directly into the bore), and wipe the plate edges and bore clean. Never force the plate on a drive-by-wire unit and never spray cleaner into electronic actuators.",
        tools: ["Throttle-body cleaner", "Lint-free cloths"],
        estMinutes: 25,
      },
      {
        title: "Relearn and test",
        body: "Refit the trunking, reconnect the battery, and start the engine — idle may hunt for a few minutes while the ECU relearns. Drive gently for a trip, then clear any codes. If idle faults persist or the plate motor is dead, replacement and calibration are workshop work.",
        tools: ["OBD2 adapter"],
        estMinutes: 20,
      },
      {
        title: "Clear the codes and re-scan",
        body: "Clear the throttle/idle codes after the relearn drive and re-scan a few trips later. A returning code means an actuator, sensor or wiring fault — book a workshop rather than repeating the clean.",
        tools: ["OBD2 adapter"],
        estMinutes: 10,
      },
    ],
  },
  engine_timing: {
    family: "engine_timing",
    title: "Engine timing — knock, crank and cam sensors",
    safetyNote:
      "Timing faults can mask mechanical timing problems. If the engine rattles, knocks audibly, or the timing belt/chain interval is overdue, do not drive it — a slipped belt destroys engines. Tow, don't risk it.",
    steps: [
      {
        title: "Listen before anything else",
        body: "Start the engine and listen: rattling from the timing cover, loud knocking, or sudden rough running after a belt-interval milestone are red flags. If any are present, stop driving and arrange a tow — no sensor swap fixes mechanical timing.",
        tools: ["None"],
        estMinutes: 5,
      },
      {
        title: "Check oil level and condition",
        body: "Cam-phasing and many timing codes depend on oil pressure. Check the level and look at its condition — very low or sludged oil causes phaser faults that read as sensor codes. Top up or change with the correct specification first.",
        tools: ["Dipstick", "Correct-spec oil"],
        estMinutes: 10,
      },
      {
        title: "Inspect the sensor wiring",
        body: "Crank and cam sensors live in hot, oily places and their cables fail often. Check each named sensor's connector for oil contamination and corrosion, and its cable for chafing. Clean reseating fixes a real share of these codes.",
        tools: ["Torch"],
        estMinutes: 20,
      },
      {
        title: "Replace the named sensor if indicated",
        body: "If the code names one sensor and the wiring is sound, replacing that sensor is reasonable DIY on many cars — one bolt and one connector, with the correct part for your engine. Clear the code and test. If codes name several sensors at once, suspect wiring or timing, not all sensors failing together.",
        tools: ["Socket set", "Replacement sensor"],
        estMinutes: 30,
      },
      {
        title: "Clear the codes and re-scan — escalate fast",
        body: "Clear and drive, then re-scan. Timing codes that return after a sensor swap, or any code paired with noises or running faults, go straight to a workshop — slipped timing is an engine-killer and diagnosis needs specialist tools.",
        tools: ["OBD2 adapter"],
        estMinutes: 10,
      },
    ],
  },
  general: {
    family: "general",
    title: "General diagnosis — code not yet mapped",
    safetyNote:
      "This code does not map to a known repair area yet, so there is no safe default repair. Do not replace parts by guessing.",
    steps: [
      {
        title: "Record exactly what the car does",
        body: "Write down when the light came on, any noises, smells, smoke, warning lights or behaviour changes, and whether anything was recently repaired. Symptoms choose the diagnosis more than the code number does.",
        tools: ["Notepad"],
        estMinutes: 10,
      },
      {
        title: "Visual inspection under the bonnet",
        body: "With the engine off and cool, look for the obvious: disconnected or cracked hoses, damaged wiring, fluid leaks, low oil or coolant, a loose fuel cap. Fix nothing yet — just look and note.",
        tools: ["Torch"],
        estMinutes: 15,
      },
      {
        title: "Check connectors and recent work",
        body: "If any connector was recently disturbed (service, battery change, accessory fitting), reseat it firmly. Corroded or loose connectors cause a large share of mystery codes.",
        tools: ["None"],
        estMinutes: 10,
      },
      {
        title: "Clear, drive, and re-scan once",
        body: "Clear the code and drive normally for a few trips, then re-scan. An intermittent that never returns may have been a one-off; a code that returns promptly is a real fault needing proper diagnosis.",
        tools: ["OBD2 adapter"],
        estMinutes: 10,
      },
      {
        title: "Clear, re-scan, and book a diagnostic visit if it returns",
        body: "Clear the code and drive normally for a few trips, then re-scan. An intermittent that never returns may have been a one-off; a code that returns promptly is a real fault — take it to a workshop with manufacturer-level diagnostics, asking for a diagnostic hour quoted up front, and bring your symptom notes and both scan readouts with you.",
        tools: ["Phone"],
        estMinutes: 15,
      },
    ],
  },
};

/**
 * Resolve the ordered steps for a family. Unknown families resolve to the
 * "general" guide — never throws, never returns an empty list.
 */
export function repairStepsFor(family: RepairFamily | string): RepairStep[] {
  return repairGuideFor(family).steps;
}

/** Full guide (title + safety note + steps) for a family. */
export function repairGuideFor(family: RepairFamily | string): RepairGuide {
  const key: RepairFamily =
    family === "general" || REPAIR_FAMILIES.includes(family as RepairFamily)
      ? (family as RepairFamily)
      : "general";
  return GUIDES[key] ?? GUIDES.general;
}

/** Every family key that ships a guide — used by tests to pin coverage. */
export function repairFamilyKeys(): RepairFamily[] {
  return [...REPAIR_FAMILIES];
}
