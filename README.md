# Bergen live

Live-kart over kollektivtrafikken i Bergen: busser, Bybanen og båter i sanntid.

## Funksjoner

- **Live-kart** med posisjoner fra Entur, oppdatert hvert 5. sekund
- **Filtrering** på transporttype og linje, og søk på destinasjon
- **Forsinkelsesfarger:** se hvor det står fast akkurat nå
- **Følg et kjøretøy:** kartet følger bussen og viser neste stopp med forventet tid
- **Avgangstavle:** søk eller trykk på en holdeplass for å se avganger i sanntid, og lagre favoritter
- **Hvor er bussen min?:** velg linje på holdeplassen og se hvor langt unna bussen er
- **Bybanen:** posisjonen er anslått ut fra sanntidsavgangene, fordi Bybanen ikke sender GPS til Entur
- **Bergen nå:** antall kjøretøy i trafikk, punktlighet, mest forsinkede linje, vær og regnvarsel neste 90 min, og strømpris (NO5)
- **Kartvalg:** mørkt, lyst, Kartverket topo og gråtone, satellitt og OpenSeaMap-sjømerker
- **Installerbar app (PWA):** «Legg til på Hjem-skjerm» på mobil, eller «Installer» i Chrome og Edge
- **Varsel når bussen nærmer seg:** trykk på 🔔 ved en avgang og velg hvor mange minutter før du vil ha beskjed. Varselet virker så lenge appen er åpen, også i bakgrunnen. På iPhone kreves det at appen er lagt til på Hjem-skjerm.
- **Skjermmodus:** stor avgangstavle for iPad eller TV, med klokke og vær, som holder skjermen våken

## Delbare lenker

| Lenke | Åpner |
|---|---|
| `#stopp/58366/byparken` | Avgangstavla for en holdeplass (tallet er NSR-id) |
| `#stopp-byparken` | Søker opp holdeplassen etter navn |
| `#skjerm/58366` | Skjermmodus for en holdeplass |
| `#skjerm/58366,58367/linjer=20,21` | Skjermmodus for flere holdeplasser, med linjefilter |
| `#linje/20` | Kartet filtrert på linje 20 (flere: `#linje/20,21`) |
| `#bergen-na` | Bergen nå-oversikten |

Adressen oppdateres automatisk mens du bruker siden, og «Del»-knappen på en holdeplass kopierer lenken.

## Kjøre lokalt

Siden er `index.html` pluss `manifest.webmanifest`, `sw.js` og `icons/`, uten byggesteg:

```bash
python3 -m http.server
# åpne http://localhost:8000
# (service worker og installasjon krever http/https, ikke file://)
```

## Publisere

Siden kan legges ut gratis med GitHub Pages: gå til Settings → Pages, velg branch `main` og mappen `/ (root)`.

## Datakilder

| Data | Kilde |
|---|---|
| Kjøretøyposisjoner | [Entur Vehicles API](https://developer.entur.org) |
| Avganger, holdeplasser, turer | [Entur Journey Planner v3](https://developer.entur.org) |
| Holdeplass-søk | Entur Geocoder |
| Vær og regnvarsel | [MET Norway](https://api.met.no) (nowcast / locationforecast) |
| Strømpris | [hvakosterstrommen.no](https://www.hvakosterstrommen.no) |
| Kart | OpenStreetMap, Kartverket, Esri, OpenSeaMap |

Entur ber om at klienter identifiserer seg med `ET-Client-Name`. Endre `CLIENT` øverst i skriptet til ditt eget navn, for eksempel `dittnavn-bergenlive`.

Før siden får mye trafikk bør standardkartet byttes fra OpenStreetMap sine servere til Kartverket eller en leverandør med nøkkel, for eksempel MapTiler. OSM sine servere er ikke ment for mye trafikk fra én nettside.
