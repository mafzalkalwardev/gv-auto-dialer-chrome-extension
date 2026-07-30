# GV Auto Dialer — by Indus Web Agency

Chrome MV3 extension that turns [Google Voice](https://voice.google.com) into a **queue-based outbound dialer**: import leads, auto-dial with a delay, tag outcomes, export an XLSX call report. Includes a **subscription gate** (trial + admin-approved plans) with **one device per account**.

**Made by [Indus Web Agency](https://www.induswebagency.com)**  
**WhatsApp support:** [+92 307 9670503](https://wa.me/923079670503)

| | |
|---|---|
| **Website** | [induswebagency.com](https://www.induswebagency.com) |
| **Accounts API** | [gv-auto-dialer-accounts.vercel.app](https://gv-auto-dialer-accounts.vercel.app) |
| **Admin** | [/admin](https://gv-auto-dialer-accounts.vercel.app/admin) |
| **Privacy** | [/privacy](https://gv-auto-dialer-accounts.vercel.app/privacy) |

No build step. Load unpacked to develop, or publish to the Chrome Web Store for clients.

---

## Features

- Import contacts from `.csv` / `.xlsx` / `.xls`
- Auto-dial queue with configurable gap between calls
- On-page HUD on Google Voice + side panel controls
- Manual outcome tagging and XLSX call reports
- Free 1-hour trial, register → pending → admin activate
- Plans: 1 day / 1 week / 15 days / 1 month / 1 year
- One active device per account (logout or admin reset to move)
- Branded by Indus Web Agency with in-panel WhatsApp support

---

## Install (developers)

1. `chrome://extensions` → enable **Developer mode**
2. **Load unpacked** → select this folder (the one that contains `manifest.json`)
3. Open `https://voice.google.com/u/0/calls`
4. Click the extension icon to open the side panel
5. **Start free 1-hour trial** or log in with an approved account

## Install (clients)

Once published: search the [Chrome Web Store](https://chrome.google.com/webstore) for **GV Auto Dialer by Indus Web Agency**, click **Add to Chrome**, then open Google Voice and use the side panel.

Need help? WhatsApp [+92 307 9670503](https://wa.me/923079670503) or visit [induswebagency.com](https://www.induswebagency.com).

---

## Publish to the Chrome Web Store

Yes — ready to submit. Full checklist: **[PUBLISHING.md](./PUBLISHING.md)**.

1. [Chrome Web Store developer account](https://chrome.google.com/webstore/devconsole) ($5 one-time).
2. Zip extension contents (`manifest.json` at zip root). Include `icons/` (Indus logo). Exclude `server/`, `test/`, docs, `.git`.
3. Upload → listing → privacy policy: `https://gv-auto-dialer-accounts.vercel.app/privacy`
4. Submit for review.

**Risk:** Google may scrutinize automation of Voice. Fallback: Unlisted or Load unpacked.

---

## Accounts server

Hosted free on **Vercel** + **Neon Postgres**.

Local / redeploy: [`server/README.md`](./server/README.md). Production project: `gv-auto-dialer-accounts`.

---

## First run (dialing)

```
Upload contacts  →  sample-leads.csv
```

| Accepted for the number | Accepted for the name |
|---|---|
| `Phone Number`, `phone`, `number`, `mobile`, `cell`, `phone_number` | `Customer Name`, `name`, `contact`, `full name`, `customer` |

### Report output

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

When dialing breaks, on `voice.google.com` DevTools run `GVSel.probe()` and repair `content/selectors.js`.

---

## Testing

```bash
npm test
```

---

## Guardrails

- **Calling window** — flags contacts outside 8am–9pm local time (toggleable).
- **DNC list** — numbers in `chrome.storage.local.dncList` dropped at import.

Not legal compliance. TCPA/DNC/consent and Google’s terms remain yours.

---

## File map

| File | Responsibility |
|---|---|
| `manifest.json` | MV3 config — branded as Indus Web Agency |
| `icons/` | Extension icons + Indus logo |
| `background.js` | Campaign queue, auth, persistence |
| `config.js` | Accounts API base URL |
| `sidepanel/` | UI with brand header + WhatsApp footer |
| `content/` | Google Voice automation + HUD |
| `lib/` | Phone utils, reports, SheetJS |
| `server/` | Accounts API (Vercel + Neon) |
| `PUBLISHING.md` | Chrome Web Store guide |

## Support

- **Indus Web Agency** — [induswebagency.com](https://www.induswebagency.com)
- **WhatsApp** — [+92 307 9670503](https://wa.me/923079670503)
