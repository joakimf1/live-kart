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

## Kjøre lokalt

Hele siden er én fil (`index.html`) uten byggesteg:

```bash
python3 -m http.server
# åpne http://localhost:8000
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
