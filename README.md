<div align="center">

# GV Auto Dialer Chrome Extension

<img src="https://readme-typing-svg.demolab.com?font=Inter&weight=700&size=28&duration=2800&pause=700&color=0EA5E9&center=true&vCenter=true&width=900&lines=Google+Voice+Queue+Dialer;Chrome+MV3+Extension;Trial+%2B+Subscription+Ready;Built+by+Indus+Web+Agency" alt="Typing SVG" />

<p>
  <img src="https://komarev.com/ghpvc/?username=mafzalkalwardev&label=Project%20Views&color=0ea5e9&style=for-the-badge" alt="Project views" />
  <img src="https://img.shields.io/github/stars/mafzalkalwardev/gv-auto-dialer-chrome-extension?style=for-the-badge&color=22c55e" alt="GitHub stars" />
  <img src="https://img.shields.io/github/forks/mafzalkalwardev/gv-auto-dialer-chrome-extension?style=for-the-badge&color=f59e0b" alt="GitHub forks" />
  <img src="https://img.shields.io/github/license/mafzalkalwardev/gv-auto-dialer-chrome-extension?style=for-the-badge&color=64748b" alt="License" />
</p>

<p>
  <img src="https://skillicons.dev/icons?i=js,chrome,html,css" alt="Skill icons" />
</p>

<p>
  <strong>GV Auto Dialer by Indus Web Agency — Google Voice queue dialer with trial/subscription flows as a Manifest V3 Chrome extension.</strong>
</p>

</div>

---

## Contribution Snake

<div align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/mafzalkalwardev/google-voice-dispatch-agent/output/github-contribution-grid-snake-dark.svg">
    <source media="(prefers-color-scheme: light)" srcset="https://raw.githubusercontent.com/mafzalkalwardev/google-voice-dispatch-agent/output/github-contribution-grid-snake.svg">
    <img alt="Contribution snake" src="https://raw.githubusercontent.com/mafzalkalwardev/google-voice-dispatch-agent/output/github-contribution-grid-snake.svg">
  </picture>
</div>

---

## SEO Keywords

`Google Voice dialer` `Chrome MV3` `queue dialer`

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
