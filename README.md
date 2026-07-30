# Google Voice Enterprise Auto Dialer

A Chrome MV3 extension that turns Google Voice into a queue-based outbound dialer.
Import a lead list, auto-dial with a configurable gap, tag each outcome, export an XLSX report.

No build step. No bundler. Clone, load unpacked, iterate.

---

## Install

1. `chrome://extensions` → enable **Developer mode**
2. **Load unpacked** → select this folder
3. Open `https://voice.google.com/u/0/calls`
4. Click the extension icon to open the side panel

## First run

```
Upload contacts  →  sample-leads.csv
```

The importer accepts `.csv`, `.xlsx`, `.xls`. Column headers are matched
case- and spacing-insensitively, so all of these work:

| Accepted for the number | Accepted for the name |
|---|---|
| `Phone Number`, `phone`, `number`, `mobile`, `cell`, `phone_number` | `Customer Name`, `name`, `contact`, `full name`, `customer` |

## Report output

`Download report (.xlsx)` produces exactly these columns:

```
Sr.No. | Phone Number | Customer Name | Call Status | Call Result |
Call Duration | Call Start Time | Call End Time
```

---

## ⚠️ The one thing that will break: selectors

Google ships obfuscated, frequently-rotated class names. **Every** DOM
assumption is quarantined in `content/selectors.js` — nothing else in the
codebase touches the Google Voice DOM.

When dialing stops working, open DevTools on `voice.google.com` and run:

```js
GVSel.probe()
```

You get a table of which selectors currently resolve. Repair only the failing
key by adding a new candidate to `CANDIDATES` in `selectors.js`. Anchor on
`aria-label`, `role`, `placeholder`, or visible text — **never** on a class.

Because the candidates are tried in order, adding a new one at the top is
non-destructive: old sites keep working via the later fallbacks.

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
                                        │  · drives dialpad│
                                        │  · reads state   │
                                        │  · renders HUD   │
                                        └──────────────────┘
```

**Three rules this design enforces:**

1. **The panel owns nothing.** It renders snapshots and sends intents. Close it
   mid-campaign and nothing is lost.
2. **The worker persists on every transition.** MV3 kills service workers after
   ~30s idle; state is written to `chrome.storage.local` on each `commit()` so a
   recycled worker resumes correctly. An open panel Port also keeps it alive,
   which is why inter-call delays can use `setTimeout` — `chrome.alarms` has a
   30-second floor and is useless for a 5-second gap.
3. **The dial loop is a state machine, not a `for` loop.** Every advance checks
   `status === 'running'` first, so Stop takes effect immediately instead of
   after the queue drains.

### State machine

```
idle ──START──► running ──DIAL──► (content: CALL_STARTED)
                   ▲                        │
                   │                  CALL_CONNECTED
                   │                        │
                   │                   CALL_ENDED
                   │                        ▼
              scheduleNext ◄──OUTCOME── awaiting_outcome
                   │
              (no ready contacts) ──► finished
```

---

## Testing

Pure logic — normalization, dedupe, calling windows — is unit tested and runs
without a browser:

```bash
npm test
```

The DOM automation cannot be unit tested; it requires a real logged-in Google
Voice session. Verify it manually with `GVSel.probe()` plus a single-contact CSV
before running a real list.

---

## Guardrails

Two safety features are built in because outbound dialing to US numbers is
regulated:

- **Calling window** — contacts are flagged when the *called party's* local time
  falls outside 8am–9pm, using a coarse NPA→timezone map. Toggleable in the panel.
- **DNC suppression** — numbers in `chrome.storage.local.dncList` are dropped at
  import and counted in the summary as *Suppressed*.

Both are engineering conveniences, not legal compliance. TCPA/DNC obligations,
consent records, and scrubbing against the federal registry remain yours. Note
also that scripted interaction with Google Voice is not something Google's terms
contemplate, and accounts doing high-volume automated dialing do get flagged.

---

## Selling this as a subscription

The extension ships with a device-locked login gate (`config.js`,
`server/`) that you run entirely by hand — no payment processor.
Clients register or start a free 1-hour trial from inside the
extension; you approve them and pick a plan (1 day, 1 week, 15 days,
1 month, 1 year) from a password-protected admin page after they pay
you however you like. Each account can only be logged in on one
computer at a time.

- **`server/`** — the accounts + admin API. Deploy it first; see
  `server/README.md` for a click-through Render setup, no command line
  required.
- **`PUBLISHING.md`** — how to publish this extension publicly on the
  Chrome Web Store so clients can find it by searching, and how to pass
  review (privacy policy, permission justifications, single-purpose
  description).

Do the server first, then point `config.js` and `manifest.json` at it,
then publish.

## File map

| File | Responsibility |
|---|---|
| `manifest.json` | MV3 config, permissions, side panel registration |
| `background.js` | Campaign queue, dial state machine, persistence |
| `content/selectors.js` | **All** Google Voice DOM selectors + `probe()` |
| `content/inject.js` | Dialpad control, call-state detection, HUD |
| `content/hud.css` | On-page HUD styling |
| `sidepanel/panel.js` | View layer — renders snapshots, sends intents |
| `sidepanel/panel.css` | Design tokens and panel styling |
| `lib/phone.js` | E.164 normalization, dedupe, calling windows (pure) |
| `lib/report.js` | Lead file parsing + XLSX report generation |
| `lib/xlsx.full.min.js` | SheetJS 0.18.5 (vendored) |
| `config.js` | Points the extension at your deployed accounts server |
| `server/` | Accounts + admin API — Express + Postgres, no payment processor |

## Known gaps

- Call-state detection relies on the presence of the hangup button and the
  on-screen timer. It cannot distinguish *answered by a human* from *answered by
  voicemail* — that's why outcome tagging is manual, same as the reference.
- The NPA→timezone table is approximate and DST is estimated by month.
- Single Google Voice tab only; behaviour with multiple tabs is undefined.
