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
- **Nedbør-tidslinje (☔ Nedbør):** dra eller spill av fra 2 timer bakover (radar) til 12 timer frem (Yr sitt 1 km-varsel) og se regnet komme inn over byen. Piltastene blar frem og tilbake.
- **☀ Min morgen:** velg en holdeplass, linjer, tidsrom og gangtid. Da ligger et kort øverst i kartet med neste avganger, «Gå om 4 min», regn ved holdeplassen og avvik.
- **Avvik:** trafikkmeldinger fra Entur (omkjøring, innstillinger) vises på avgangene
- **Båt og ferje:** snarveier til Strandkaiterminalen, Halhjem og Sandvikvåg, og ferger og hurtigbåter i et større område på kartet
- **Push-varsler når appen er lukket** (valgfritt): bussvarsler og Min morgen-varsler om innstilte avganger og forsinkelser over 5 min. Krever en gratis Cloudflare Worker, se [worker/README.md](worker/README.md).
- **Snarveier fra app-ikonet:** Favoritt, Min morgen, Nedbør og Bergen nå
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
| `#regn` | Kartet med nedbør-tidslinjen åpen |
| `#morgen` | Viser Min morgen-kortet nå |
| `#favoritt` | Avgangstavla for favoritt-holdeplassen |

Adressen oppdateres automatisk mens du bruker siden, og «Del»-knappen på en holdeplass kopierer lenken.

## Kjøre lokalt

Siden er `index.html` pluss `manifest.webmanifest`, `sw.js` og `icons/`, uten byggesteg:

```bash
python3 -m http.server
# åpne http://localhost:8000
# (service worker og installasjon krever http/https, ikke file://)
```

## Automatisk test

`.github/workflows/smoke.yml` åpner siden i ekte Chromium og sjekker at kjøretøy, avganger, følg-buss, vær, strømpris og nedbørkart laster. Den kjører ved hver opplasting og hver morgen kl. 06:30, da mot den publiserte siden. Resultatet vises som en tabell under *Actions*, med skjermbilder vedlagt. GitHub sender e-post hvis noe feiler.

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
| Radar (siste 2 t) | [RainViewer](https://www.rainviewer.com/api.html), gratis for personlig og mindre bruk, kreditering påkrevd |
| Nedbørvarsel på kart | MET Norway Victoria WMS (`public-victoria.met.no`), laget `precipitation_amount_acc1h_yr_1_0km_1h` |
| Kart | OpenStreetMap, Kartverket, Esri, OpenSeaMap |

Entur ber om at klienter identifiserer seg med `ET-Client-Name`. Endre `CLIENT` øverst i skriptet til ditt eget navn, for eksempel `dittnavn-bergenlive`.

Før siden får mye trafikk bør standardkartet byttes fra OpenStreetMap sine servere til Kartverket eller en leverandør med nøkkel, for eksempel MapTiler. OSM sine servere er ikke ment for mye trafikk fra én nettside.
