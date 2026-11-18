# Push-varsler for Bergen live (Cloudflare Worker)

Denne lille serveren gjør at varsler kommer **selv når appen er lukket**:

- **Busvarsler:** «Si fra når 20 er 5 min unna Danmarksplass»
- **Min morgen:** varsel hvis en av avgangene dine blir innstilt eller er over 5 min forsinket i tidsrommet ditt

Den er gratis på Cloudflare sitt gratisnivå. Oppsettet tar ca. 15 minutter og må gjøres én gang.

## Dette trenger du

- En gratis konto på [cloudflare.com](https://dash.cloudflare.com/sign-up)
- Node.js på en maskin der du kan kjøre kommandoer. Alternativt kan du bruke GitHub Codespaces direkte fra repoet: **Code → Codespaces → Create codespace**, som ikke krever noe installert.

## Steg for steg

Kjør alt fra mappen `worker/`:

```bash
cd worker

# 1. Logg inn på Cloudflare (åpner nettleseren)
npx wrangler login

# 2. Lag lagringen og kopier id-en du får inn i wrangler.toml (SETT_INN_KV_ID_HER)
npx wrangler kv namespace create SUBS

# 3. Sett e-posten din i wrangler.toml (SETT_INN_EPOST_HER)

# 4. Lag nøkler for push
node generate-vapid.mjs

# 5. Legg inn nøklene som hemmeligheter (lim inn verdiene fra steg 4 når du blir spurt)
npx wrangler secret put VAPID_PUBLIC
npx wrangler secret put VAPID_PRIVATE_JWK

# 6. Publiser
npx wrangler deploy
```

Steg 6 gir deg en adresse som `https://bergen-live-push.<navn>.workers.dev`.

## Koble appen til Worker-en

Åpne `config.js` i roten av repoet og lim inn adressen:

```js
self.BLK_CONFIG = {
  PUSH_API: 'https://bergen-live-push.<navn>.workers.dev',
};
```

Commit, så er det i gang. Åpne appen, sett et 🔔-varsel eller ☀ Min morgen, og godta varsler når nettleseren spør.

**iPhone:** push-varsler virker bare når appen er lagt til på Hjem-skjermen (Del → Legg til på Hjem-skjerm), og du må åpne den derfra.

## Slik virker det

1. Appen registrerer et push-abonnement og sender varslene dine til `POST /subscribe`.
2. Hvert minutt spør Worker-en Entur om de aktuelle holdeplassene. Den gjør det bare hvis noen har et aktivt varsel eller er innenfor Min morgen-tidsrommet.
3. Når noe skal varsles, legges meldingen klar, og en tom push sendes til telefonen.
4. Appens service worker henter meldingen fra `GET /messages` og viser varselet.

Pushen sendes uten innhold, så det trengs ingen kryptering av meldingene. Det eneste som lagres, er push-adressen til nettleseren og varslene du har satt.

## Begrensninger

- KV-lagringen på gratisnivået tåler 1 000 skrivinger per døgn. Det holder fint for deg og noen venner. Får appen mange brukere, bør lagringen flyttes til Cloudflare D1.
- Varslene sjekkes én gang i minuttet, så de kan komme opptil ett minutt for sent.
