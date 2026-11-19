# Crossing Watch

Decision support for getting around Roosevelt Island and the Queensboro corridor. Check island-specific subway alerts, broaden to the rest of the F/M routes, see measured corridor road speeds when a sensor reports, and jump to the agencies' tram, ferry and camera pages.

## Run it

Node 22 or newer. No dependencies to install, no keys, no analytics.

- `npm test`: parser, time-zone, freshness, filter and network-contract tests.
- `npm start`: local preview on http://localhost:4173.
- `http://localhost:4173/?demo=1`: clearly fictional, deterministic alert and speed examples.
- Deploy: use GitHub Pages **Settings → Pages → Source → GitHub Actions** in a public repo. The included workflow tests and deploys `public/` from main. No paid compute or credentials for a data backend.

## Sources and semantics

| Card | Source | What it actually means |
| --- | --- | --- |
| Subway | [MTA Developer Resources](https://api.mta.info/), official server-decoded GTFS Realtime JSON; [station catalog](https://data.ny.gov/Transportation/MTA-Subway-Stations/39hk-dx4f) | Feed timestamps, alerts active now or starting in the next 12 hours. Island scope comes from Roosevelt Island stop ID or a matching text mention on the F/M routes. Route-wide context may refer to work miles away. An empty alert list is not an all-clear or an arrival prediction. |
| Road | [NYC DOT Traffic Speeds](https://data.cityofnewyork.us/d/i4gi-tjb9) | Latest usable sensor observation per corridor link in a one-hour lookback. Sensor labels tell you what segment was measured; mph is not vehicle volume or a travel guarantee. Zero or unreported readings are excluded instead of presented as clear. |
| Operator links only | [RIOC](https://www.rioc.ny.gov/), [NYC Ferry](https://www.ferry.nyc/routes-and-schedules/astoria/), [511NY](https://511ny.org/) | The app does not poll these links or label a schedule as live status. Camera images remain on their agency site. No frames are fetched or stored. |

Subway is stale after five minutes, road observations after 20 minutes. Last good per-source results stay in memory during refresh errors, with an explicit stale label. Live mode never substitutes synthetic values; use the separate demo link to test the UI. All times display in New York time. DOT's floating local timestamps use Eastern time; on the DST fall-back fold, the latest matching nonfuture instant is chosen.

## Architecture decisions

- Two independent, bounded-time client-side requests; one feed's outage does not hide the other card. Validated, deduplicated objects cross a small parser boundary, and all remote text uses text nodes rather than HTML injection. No addresses, credentials, cookies or stored telemetry.
- Use official JSON instead of bundling a protobuf runtime. Use a small SoQL projection and bounded window rather than shipping raw detector history to clients. Named-corridor matching is transparent and intentionally does not substitute sensors elsewhere in the city when the crossing is uninstrumented.
- Use a small inline schematic rather than bringing in basemap tiles. It is not a navigational map. Queensboro passes over the island; the vehicular approach to the island is from Queens via Roosevelt Island Bridge.
- Static hosting minimizes recurring cost and avoids operating a data proxy. The deployment can still present true feed-outage and empty-observation states. A future dashboard could make pedestrian routing, elevator outages, or operator handoffs first-class after source and license verification.

## Demo walkthrough

1. Open the live page and show the two independent source badges.
2. Toggle **Show island alerts only** to compare station-level and route-wide F/M context; use live data when available. If needed, switch explicitly to fictional demo mode, not a staged “live” view.
3. Scroll to agency links and the Queensboro-vs-Roosevelt-Island-Bridge distinction. Traffic mileage/speeds (where sensor rows exist) are link measurements; if absent, show the honest no-readings state.
