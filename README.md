# Google Voice Enterprise Auto Dialer

Chrome MV3 extension that turns [Google Voice](https://voice.google.com) into a **queue-based outbound dialer**: import leads, auto-dial with a delay, tag outcomes, export an XLSX call report. Includes a **subscription gate** (trial + admin-approved plans) with **one device per account**.

**Live accounts API:** [https://gv-auto-dialer-accounts.vercel.app](https://gv-auto-dialer-accounts.vercel.app)  
**Admin:** [https://gv-auto-dialer-accounts.vercel.app/admin](https://gv-auto-dialer-accounts.vercel.app/admin)  
**Privacy policy:** [https://gv-auto-dialer-accounts.vercel.app/privacy](https://gv-auto-dialer-accounts.vercel.app/privacy)

No build step. No bundler. Load unpacked to develop, or publish to the Chrome Web Store for clients.

---

## Features

- Import contacts from `.csv` / `.xlsx` / `.xls`
- Auto-dial queue with configurable gap between calls
- On-page HUD on Google Voice + side panel controls
- Manual outcome tagging and XLSX call reports
- Free 1-hour trial, register → pending → admin activate
- Plans: 1 day / 1 week / 15 days / 1 month / 1 year
- One active device per account (logout or admin reset to move)

---

## Install (developers)

1. `chrome://extensions` → enable **Developer mode**
2. **Load unpacked** → select this folder (the one that contains `manifest.json`)
3. Open `https://voice.google.com/u/0/calls`
4. Click the extension icon to open the side panel
5. **Start free 1-hour trial** or log in with an approved account

## Install (clients)

Once published: search the [Chrome Web Store](https://chrome.google.com/webstore) for **Google Voice Enterprise Auto Dialer**, click **Add to Chrome**, then open Google Voice and use the side panel.

Until then, send them this repo / a zip of the extension files (not including `server/`) and the Load unpacked steps above.

---

## Publish to the Chrome Web Store

Yes — this extension is ready to submit. Full checklist: **[PUBLISHING.md](./PUBLISHING.md)**. Short version:

1. Create a [Chrome Web Store developer account](https://chrome.google.com/webstore/devconsole) ($5 one-time fee).
2. Zip the extension **contents** (so `manifest.json` is at the zip root). **Exclude** `server/`, `test/`, `.git`, docs.
3. Dashboard → **New item** → upload zip.
4. Fill store listing, screenshots, privacy practices, and set privacy policy URL to:  
   `https://gv-auto-dialer-accounts.vercel.app/privacy`
5. Visibility: **Public** (searchable) or **Unlisted** (link-only).
6. Submit for review (hours to a few days).

**Honest risk:** the extension automates Google Voice’s web UI. Google may scrutinize or reject the listing, and heavy automated dialing can risk the user’s Google account. State that clearly to clients. Fallback: Unlisted listing or private Load-unpacked distribution.

After approval, bump `version` in `manifest.json`, re-zip, upload a new package — installs update automatically.

---

## Accounts server (already deployed)

Hosted free on **Vercel** + **Neon Postgres** (permanent free tiers; may cold-start after idle).

| Item | Value |
|------|--------|
| API base | `https://gv-auto-dialer-accounts.vercel.app` |
| Admin | `/admin` (Basic auth via `ADMIN_USER` / `ADMIN_PASSWORD` in Vercel env) |
| Extension config | [`config.js`](./config.js) → `ACCOUNTS_API_BASE` |
| Host permission | [`manifest.json`](./manifest.json) |

Local / redeploy notes: [`server/README.md`](./server/README.md). Source of truth for production is the Vercel project `gv-auto-dialer-accounts`.

---

## First run (dialing)

```
Upload contacts  →  sample-leads.csv
```

Column headers are matched case- and spacing-insensitively:

| Accepted for the number | Accepted for the name |
|---|---|
| `Phone Number`, `phone`, `number`, `mobile`, `cell`, `phone_number` | `Customer Name`, `name`, `contact`, `full name`, `customer` |

### Report output

`Download report (.xlsx)` columns:

```
Sr.No. | Phone Number | Customer Name | Call Status | Call Result |
Call Duration | Call Start Time | Call End Time
```

---

## Architecture

```
┌─────────────────┐   Port: gv-panel    ┌──────────────────┐
│  Side panel     │◄───────────────────►│  Service worker  │
│  (view only)    │   STATE snapshots   │  (owns campaign) │
└─────────────────┘                     └────────┬─────────┘
                                                 │ Port: gv-content
                                        ┌────────▼─────────┐
                                        │  Content script  │
                                        │  on voice.google │
                                        └──────────────────┘
```

Accounts API (Vercel) authenticates the extension; campaign state lives in `chrome.storage.local`.

### Selectors (the thing that breaks)

Google rotates obfuscated class names. **All** DOM assumptions live in `content/selectors.js`. When dialing breaks, on `voice.google.com` DevTools run:

```js
GVSel.probe()
```

Repair only failing keys in `CANDIDATES` — prefer `aria-label` / text, never a class.

---

## Testing

```bash
npm test
```

DOM automation needs a real logged-in Google Voice session.

---

## Guardrails

- **Calling window** — flags contacts outside 8am–9pm in the called party’s approximate local time (toggleable).
- **DNC list** — numbers in `chrome.storage.local.dncList` are dropped at import.

These are conveniences, not legal compliance. TCPA/DNC/consent and Google’s terms remain your responsibility.

---

## File map

| File | Responsibility |
|---|---|
| `manifest.json` | MV3 config, permissions, side panel |
| `background.js` | Campaign queue, auth, persistence |
| `config.js` | Accounts API base URL |
| `content/selectors.js` | Google Voice DOM selectors + `probe()` |
| `content/inject.js` | Dialpad, call state, HUD |
| `sidepanel/` | UI |
| `lib/` | Phone utils, reports, SheetJS |
| `server/` | Express + Postgres accounts API (deployed to Vercel) |
| `PUBLISHING.md` | Chrome Web Store submission guide |

## Known gaps

- Cannot distinguish human answer vs voicemail — outcomes are manual.
- NPA→timezone map is approximate.
- Single Google Voice tab only.
