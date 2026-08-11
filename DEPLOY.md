# Deploying WCAG Translator

Fresh deployment. This service has never been on the droplet, so every step
below is a first run.

Target: `https://wcag-translator.msschermer.us`

---

## 1. Build and verify locally

Open PowerShell and confirm where you are before doing anything. The whole
build happens in the project directory, not one level up.

```powershell
cd C:\Users\mike\dev\wcag-translator
Get-Location
```

It must print:

```
C:\Users\mike\dev\wcag-translator
```

Then:

```powershell
npm ci
```

Download the W3C data:

```powershell
npm run sync:wcag
```

Expected:

```
Fetching WCAG 2.2 from https://www.w3.org/WAI/WCAG22/wcag.json
  87 success criteria, 400+ glossary terms -> ...\data\source\wcag-2.2.json
Fetching WCAG 2.1 from https://www.w3.org/WAI/WCAG21/wcag.json
  ...
WCAG source sync complete.
```

Exact counts come from the current W3C source. Do not hardcode or expect
specific numbers. If this step fails, the error names the reason (HTTP status,
wrong content type, changed structure) rather than dying on a JSON parse.

Normalise it and generate the checker rule map:

```powershell
npm run build:data
```

Expected shape, two lines:

```
Generated NNN criteria, NNN techniques, NNN glossary terms, 52 vocabulary phrases (checksum xxxxxxxx) -> ...
Generated 115 checker rules (axe-core 4.13.0: 105, lighthouse-only: 10, 29 with no WCAG mapping) -> ...
```

Sanity check before moving on:

- criteria should be somewhere around 85 to 90
- techniques should be in the hundreds, not tens
- **glossary must not be zero.** Zero means the W3C `terms` key moved again and
  the build guard did not catch it.

Then confirm the vocabulary still lines up with the real data. This is the one
figure that silently drifts as W3C renumber things:

```powershell
(Invoke-RestMethod http://localhost:3000/v1/stats).developerVocabulary
```

`referencedCriteria` and `mappedCriteria` should both read 67. If `mappedCriteria`
is lower, a phrase points at a criterion the current W3C source no longer has,
and `npm run build:data` will name it.

Copy the self-hosted fonts into place:

```powershell
npm run build:fonts
```

Expected:

```
Copied 7 woff2 files and generated fonts.css -> ...\public\fonts
```

If you skip this the page still works, but the blueprint identity falls back to
system faces. The strict CSP blocks remote font stylesheets by design, so there
is no Google Fonts fallback.

Run the tests and start it:

```powershell
npm test
npm start
```

Open http://localhost:3000

---

## 2. Exercise the API directly

In a second PowerShell window:

```powershell
Invoke-RestMethod http://localhost:3000/v1/health | ConvertTo-Json -Depth 5
```

Check `dataset.ageDays` is 0 and `dataset.stale` is false.

```powershell
Invoke-RestMethod "http://localhost:3000/v1/search?q=contrast ratio"
Invoke-RestMethod "http://localhost:3000/v1/criteria/1.4.3"
Invoke-RestMethod "http://localhost:3000/v1/glossary/accessible name"
Invoke-RestMethod "http://localhost:3000/v1/techniques/H37"
```

The one that matters:

```powershell
Invoke-RestMethod `
  -Method Post `
  -Uri http://localhost:3000/v1/translate `
  -ContentType "application/json" `
  -Body '{"query":"focus disappears behind the sticky header","version":"2.2"}' |
  ConvertTo-Json -Depth 8
```

You should see `2.4.11 Focus Not Obscured (Minimum)`, level AA, confidence
`high`, basis `signals`.

Now the rule ingest path, which is the other half of the product:

```powershell
Invoke-RestMethod `
  -Method Post `
  -Uri http://localhost:3000/v1/translate/rule `
  -ContentType "application/json" `
  -Body '{"rules":["color-contrast","button-name","link-name","region"]}' |
  ConvertTo-Json -Depth 8
```

Expect 3 distinct criteria (1.4.3, 2.4.4, 4.1.2), with `region` reported as
resolved but `wcagMapped: false`. If `region` comes back unresolved instead, the
rule map did not build.

And the report ingest, which is what a CI step would actually call:

```powershell
$axe = '{"violations":[{"id":"color-contrast","impact":"serious","nodes":[{},{},{}]},{"id":"button-name","impact":"critical","nodes":[{}]},{"id":"region","impact":"moderate","nodes":[{}]}],"incomplete":[{"id":"aria-hidden-focus","nodes":[{}]}]}'

Invoke-RestMethod `
  -Method Post `
  -Uri http://localhost:3000/v1/report `
  -ContentType "application/json" `
  -Body "{""report"": $axe}" |
  ConvertTo-Json -Depth 8
```

Expect `format: axe`, 5 occurrences, 4.1.2 first (critical), then 1.4.3.

Check the coverage figure, which is the number worth quoting:

```powershell
(Invoke-RestMethod http://localhost:3000/v1/coverage).summary
```

On the real W3C data this should show most criteria as `manual-only`. If
`automated` comes back as zero, the rule map did not build.

Then confirm the false positive guard still holds. This should return an empty
results array:

```powershell
Invoke-RestMethod `
  -Method Post `
  -Uri http://localhost:3000/v1/translate `
  -ContentType "application/json" `
  -Body '{"query":"the filename is wrong"}'
```

Stop the server with Ctrl+C.

---

## 3. Push to GitHub

Create the repository `wcag-translator` under `msschermer`, then:

```powershell
git init
git add -A
git commit -m "WCAG Translator: developer language to WCAG guidance API"
git branch -M main
git remote add origin https://github.com/msschermer/wcag-translator.git
git push -u origin main
```

Two workflows run:

- **Test** must pass. It runs against the committed fixture and does not touch
  the network.
- **Build and publish** pushes `ghcr.io/msschermer/wcag-translator:latest`.

There is also a non-blocking `data-contract` job that fetches the live W3C JSON.
If only that one goes red, W3C changed something. Read its log, do not ignore it,
but it does not block the release.

Once the build finishes, go to the package page on GitHub and **set the GHCR
package visibility to public**, same as your other portfolio images. If you skip
this, the droplet pull fails with an auth error.

---

## 4. Deploy to the droplet

```bash
ssh portfolio
cd ~/portfolio-infra
```

Add the service to `docker-compose.yml`:

```yaml
  wcag-translator:
    image: ghcr.io/msschermer/wcag-translator:latest
    container_name: wcag-translator
    restart: unless-stopped
    environment:
      NODE_ENV: production
      PORT: "3000"
      CORS_ORIGIN: "*"
      TRUST_PROXY: "1"
      PUBLIC_RATE_LIMIT: "60"
      API_RATE_LIMIT: "300"
    networks:
      - web
```

Add the Caddy route:

```
wcag-translator.msschermer.us {
    import origin_cert
    reverse_proxy wcag-translator:3000
}
```

Make sure the DNS record for `wcag-translator` exists in Cloudflare before
reloading Caddy, otherwise the route resolves to nothing.

Bring it up:

```bash
docker compose pull wcag-translator
docker compose up -d wcag-translator
docker compose ps
docker compose logs --tail=100 wcag-translator
```

First boot logs a single JSON line:

```json
{"level":"info","message":"WCAG Translator 3.0.0 listening on 3000","dataset":{...},"trustProxy":1}
```

Confirm `"trustProxy":1` is the **number** 1 and not the string `"1"`. If it is
a string, per client rate limiting is silently disabled behind Caddy.

Reload Caddy:

```bash
docker compose exec caddy caddy reload --config /etc/caddy/Caddyfile
```

---

## 5. Verify in production

```bash
curl -sS https://wcag-translator.msschermer.us/v1/health | jq
```

Confirm rate limiting actually sees distinct clients. Run this from your laptop
and from the droplet, and check the `X-RateLimit-Remaining` values move
independently:

```bash
curl -sSI https://wcag-translator.msschermer.us/v1/health | grep -i ratelimit
```

If both drop in lockstep, `trust proxy` is misconfigured.

```bash
curl -sS https://wcag-translator.msschermer.us/v1/translate \
  -H 'content-type: application/json' \
  -d '{"query":"my form fields do not have labels"}' | jq '.data.translation.results[].criterion'
```

Then load `https://wcag-translator.msschermer.us` and run one example from the
page.

---

## 6. Add the card to the hub

Suggested copy, matching the format of the existing cards:

- **What it is:** an API that translates plain engineering language, checker
  rule ids and whole scan reports into WCAG success criteria, techniques and
  terminology
- **Built with:** Node, Express, the official W3C machine readable WCAG JSON,
  axe-core rule metadata
- **Runs as:** a single container, data and fonts baked in at build time,
  rebuilt monthly on a schedule
- **Also does:** eats a whole axe, Lighthouse or Pa11y report and tells you
  which success criteria it actually touched, plus how much of WCAG automation
  cannot see at all
- **When it fails:** halts the build on an unexpected W3C structure rather than
  shipping an empty index, keeps serving the last good baked in data set if
  w3.org is unreachable, and labels weak matches as low confidence so they read
  as leads rather than answers

---

## Ongoing

The scheduled workflow rebuilds and republishes the image on the 5th of each
month. To pick that up:

```bash
cd ~/portfolio-infra
docker compose pull wcag-translator
docker compose up -d wcag-translator
```

If you ever see `dataset.stale: true` in `/v1/health`, the running image is more
than 45 days behind the W3C publication cycle and needs that pull.
