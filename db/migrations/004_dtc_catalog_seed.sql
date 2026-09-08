-- iMechanic — 004_dtc_catalog_seed.sql (Slice S3, merge-gate R1).
--
-- Seeds the 51-row launch set of common generic P-codes into dtc_catalog.
--
-- GENERIC GUIDANCE ONLY — these titles and causes describe what a code
-- USUALLY means on a typical petrol car. They are not manufacturer-specific
-- repair advice: the same code can have different causes on different makes,
-- and nothing here replaces a proper diagnosis. The UI must never present
-- generic_cause as certain — it is the common cause, honestly labelled.
--
-- severity_default is a DISPLAY HINT ONLY. The deterministic rules engine
-- (src/lib/diagnosis.ts) never overrides a verdict on it — verdicts come
-- from the first-match-wins rule ladder over the scan's codes. In particular
-- NOTHING seeds as stop_driving: stop_driving is produced only by the rules
-- engine combining codes (stored misfire + stored catalyst), never by a
-- single catalog row.
--
-- Idempotent: INSERT ... ON CONFLICT (code) DO NOTHING, so re-running the
-- migration (and the append-only runner) never duplicates or overwrites rows.
-- Applied via `bun run migrate` like every other migration — never by hand.

INSERT INTO dtc_catalog (code, title, system, generic_cause, severity_default) VALUES
-- ------------------------------------------------------------------
-- Display hint drive_on: catalyst / EVAP / thermostat families.
-- These affect emissions or warm-up, not safe driving.
-- ------------------------------------------------------------------
('P0420', 'Catalyst efficiency below threshold (bank 1)', 'Emissions', 'The catalytic converter on bank 1 is no longer cleaning the exhaust properly. On an older car the converter itself is usually worn out.', 'drive_on'),
('P0430', 'Catalyst efficiency below threshold (bank 2)', 'Emissions', 'The catalytic converter on bank 2 is no longer cleaning the exhaust properly. On an older car the converter itself is usually worn out.', 'drive_on'),
('P0421', 'Warm-up catalyst efficiency below threshold (bank 1)', 'Emissions', 'The bank 1 converter takes too long to start working after a cold start. On an older car the converter itself is usually wearing out.', 'drive_on'),
('P0431', 'Warm-up catalyst efficiency below threshold (bank 2)', 'Emissions', 'The bank 2 converter takes too long to start working after a cold start. On an older car the converter itself is usually wearing out.', 'drive_on'),
('P0440', 'Evaporative emission system fault', 'Emissions', 'The system that traps fuel vapours has a general fault. Often a loose fuel cap, a cracked hose, or a tired purge valve.', 'drive_on'),
('P0441', 'EVAP incorrect purge flow', 'Emissions', 'The purge valve is letting through more or less vapour than expected. Usually a sticking purge valve.', 'drive_on'),
('P0442', 'EVAP small leak detected', 'Emissions', 'A small leak in the fuel vapour system. A loose or worn fuel cap seal is the usual culprit.', 'drive_on'),
('P0446', 'EVAP vent control circuit fault', 'Emissions', 'The vent valve that lets the vapour system breathe is stuck, or its wiring has a fault.', 'drive_on'),
('P0455', 'EVAP large leak detected', 'Emissions', 'A large leak in the fuel vapour system. Often the fuel cap left off after refuelling, or a split hose.', 'drive_on'),
('P0456', 'EVAP very small leak detected', 'Emissions', 'A very small leak in the fuel vapour system. Often just a fuel cap seal starting to wear.', 'drive_on'),
('P0457', 'EVAP leak — fuel cap loose or missing', 'Emissions', 'The system thinks the fuel cap is loose or off. Refit it properly and the code usually clears after a few drives.', 'drive_on'),
('P0496', 'EVAP flow during non-purge', 'Emissions', 'Fuel vapour is flowing when it should not be. Usually a purge valve stuck open.', 'drive_on'),
('P0128', 'Coolant thermostat below regulating temperature', 'Cooling', 'The engine takes too long to warm up. The thermostat is most likely stuck open.', 'drive_on'),
-- ------------------------------------------------------------------
-- Display hint repair_soon: misfire / fuel mixture / sensors / EGR /
-- throttle / idle / charging families. Still driveable, book it in.
-- ------------------------------------------------------------------
('P0300', 'Random or multiple cylinder misfire', 'Ignition', 'Several cylinders are misfiring. Commonly worn spark plugs or failing ignition coils, sometimes a fuelling or air issue affecting the whole engine.', 'repair_soon'),
('P0301', 'Cylinder 1 misfire detected', 'Ignition', 'Cylinder 1 is not firing properly. Most often a worn spark plug or a failing ignition coil on that cylinder.', 'repair_soon'),
('P0302', 'Cylinder 2 misfire detected', 'Ignition', 'Cylinder 2 is not firing properly. Most often a worn spark plug or a failing ignition coil on that cylinder.', 'repair_soon'),
('P0303', 'Cylinder 3 misfire detected', 'Ignition', 'Cylinder 3 is not firing properly. Most often a worn spark plug or a failing ignition coil on that cylinder.', 'repair_soon'),
('P0304', 'Cylinder 4 misfire detected', 'Ignition', 'Cylinder 4 is not firing properly. Most often a worn spark plug or a failing ignition coil on that cylinder.', 'repair_soon'),
('P0305', 'Cylinder 5 misfire detected', 'Ignition', 'Cylinder 5 is not firing properly. Most often a worn spark plug or a failing ignition coil on that cylinder.', 'repair_soon'),
('P0306', 'Cylinder 6 misfire detected', 'Ignition', 'Cylinder 6 is not firing properly. Most often a worn spark plug or a failing ignition coil on that cylinder.', 'repair_soon'),
('P0307', 'Cylinder 7 misfire detected', 'Ignition', 'Cylinder 7 is not firing properly. Most often a worn spark plug or a failing ignition coil on that cylinder.', 'repair_soon'),
('P0308', 'Cylinder 8 misfire detected', 'Ignition', 'Cylinder 8 is not firing properly. Most often a worn spark plug or a failing ignition coil on that cylinder.', 'repair_soon'),
('P0171', 'System too lean (bank 1)', 'Fuel system', 'The engine is getting too much air or too little fuel on bank 1. Often a vacuum leak, a dirty airflow sensor, or a weak fuel pump.', 'repair_soon'),
('P0172', 'System too rich (bank 1)', 'Fuel system', 'The engine is getting too much fuel on bank 1. Often a leaking injector or a faulty sensor.', 'repair_soon'),
('P0174', 'System too lean (bank 2)', 'Fuel system', 'The engine is getting too much air or too little fuel on bank 2. Often a vacuum leak, a dirty airflow sensor, or a weak fuel pump.', 'repair_soon'),
('P0175', 'System too rich (bank 2)', 'Fuel system', 'The engine is getting too much fuel on bank 2. Often a leaking injector or a faulty sensor.', 'repair_soon'),
('P0130', 'Oxygen sensor circuit fault (bank 1, sensor 1)', 'Emissions', 'The upstream oxygen sensor on bank 1 is not reporting correctly. Usually the sensor itself or its wiring.', 'repair_soon'),
('P0131', 'Oxygen sensor low voltage (bank 1, sensor 1)', 'Emissions', 'The upstream oxygen sensor on bank 1 reads too low. Usually the sensor itself or its wiring.', 'repair_soon'),
('P0133', 'Oxygen sensor slow response (bank 1, sensor 1)', 'Emissions', 'The upstream oxygen sensor reacts too slowly. Usually an ageing sensor.', 'repair_soon'),
('P0135', 'Oxygen sensor heater fault (bank 1, sensor 1)', 'Emissions', 'The heater that brings the upstream oxygen sensor up to working temperature has failed. Usually the sensor needs replacing.', 'repair_soon'),
('P0141', 'Oxygen sensor heater fault (bank 1, sensor 2)', 'Emissions', 'The heater for the downstream oxygen sensor has failed. Usually the sensor needs replacing.', 'repair_soon'),
('P0155', 'Oxygen sensor heater fault (bank 2, sensor 1)', 'Emissions', 'The heater that brings the bank 2 upstream oxygen sensor up to working temperature has failed. Usually the sensor needs replacing.', 'repair_soon'),
('P2195', 'Oxygen sensor stuck lean (bank 1, sensor 1)', 'Fuel system', 'The upstream oxygen sensor keeps reporting a lean mixture. Often a vacuum leak or a tired sensor.', 'repair_soon'),
('P2196', 'Oxygen sensor stuck rich (bank 1, sensor 1)', 'Fuel system', 'The upstream oxygen sensor keeps reporting a rich mixture. Often a leaking injector or a tired sensor.', 'repair_soon'),
('P0101', 'Mass airflow sensor range or performance', 'Intake air', 'The airflow meter readings do not add up. Often a dirty sensor or an air leak downstream of it.', 'repair_soon'),
('P0102', 'Mass airflow sensor low input', 'Intake air', 'The airflow meter signal is too low. Often a dirty or failed sensor, or a wiring fault.', 'repair_soon'),
('P0113', 'Intake air temperature sensor high input', 'Intake air', 'The intake-air temperature reading is implausibly high. Usually the sensor itself or its wiring.', 'repair_soon'),
('P0325', 'Knock sensor circuit fault (bank 1)', 'Ignition', 'The knock sensor that listens for harmful pre-ignition is not reporting. Usually the sensor or its wiring.', 'repair_soon'),
('P0330', 'Knock sensor circuit fault (bank 2)', 'Ignition', 'The bank 2 knock sensor that listens for harmful pre-ignition is not reporting. Usually the sensor or its wiring.', 'repair_soon'),
('P0335', 'Crankshaft position sensor circuit fault', 'Ignition', 'The sensor that tells the engine where the crankshaft is has a fault. The engine may stall or refuse to start.', 'repair_soon'),
('P0340', 'Camshaft position sensor circuit fault', 'Ignition', 'The sensor that tells the engine where the camshaft is has a fault. The engine may run badly or refuse to start.', 'repair_soon'),
('P0401', 'Exhaust gas recirculation flow too low', 'Emissions', 'The EGR valve is letting too little exhaust gas back in. Often carbon build-up holding the valve shut.', 'repair_soon'),
('P0402', 'Exhaust gas recirculation flow too high', 'Emissions', 'The EGR valve is letting too much exhaust gas back in. Often a valve stuck open.', 'repair_soon'),
('P0403', 'EGR control circuit fault', 'Emissions', 'The control circuit for the EGR valve has a fault. Usually wiring or the valve actuator.', 'repair_soon'),
('P0404', 'EGR range or performance', 'Emissions', 'The EGR valve is not moving as commanded. Often carbon build-up.', 'repair_soon'),
('P0121', 'Throttle position sensor range or performance', 'Intake air', 'The throttle position reading does not match the pedal. Usually the sensor or a dirty throttle body.', 'repair_soon'),
('P2101', 'Throttle actuator control motor range or performance', 'Intake air', 'The motor that opens the throttle is not moving as commanded. The car may go into limp mode.', 'repair_soon'),
('P0560', 'System voltage fault', 'Electrical', 'The control unit sees an implausible supply voltage. Often a weak battery, a failing alternator, or corroded terminals.', 'repair_soon'),
('P0562', 'System voltage low', 'Electrical', 'The supply voltage is too low. Usually a weak battery or a failing alternator. Charge or test the battery first.', 'repair_soon'),
('P0505', 'Idle control system fault', 'Intake air', 'The engine cannot hold a steady idle. Often a dirty throttle body or a faulty idle valve.', 'repair_soon'),
('P0507', 'Idle speed higher than expected', 'Intake air', 'The idle is too fast. Often a vacuum leak or a dirty throttle body.', 'repair_soon')
ON CONFLICT (code) DO NOTHING;
