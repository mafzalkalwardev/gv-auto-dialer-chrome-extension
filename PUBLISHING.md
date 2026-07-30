# Publishing to the Chrome Web Store

Goal: a client can search the Chrome Web Store, find the extension,
install it, register or log in, and — once you've approved them from
your admin page and set how long their access lasts — use it, locked
to that one computer.

**Prerequisites (already done for this repo):**
- Accounts server live at `https://gv-auto-dialer-accounts.vercel.app`
- `config.js` and `manifest.json` point at that URL
- Privacy policy at `https://gv-auto-dialer-accounts.vercel.app/privacy`

## 1. Developer account (one time)

1. Go to `chrome.google.com/webstore/devconsole`, sign in with the
   Google account you want to own this extension.
2. Pay the one-time **$5 registration fee**.

## 2. Package the extension

Zip the **contents** of the extension folder (not the folder itself —
`manifest.json` must be at the root of the zip).

**Include:**

```
manifest.json
config.js
background.js
content/
icons/
lib/
sidepanel/
```

**Do not include:** `server/`, `test/`, `README.md`, `PUBLISHING.md`,
`.git`, `node_modules`, `.vercel`, `.env*`.

### Windows (PowerShell) from this folder

```powershell
$files = 'manifest.json','config.js','background.js','content','icons','lib','sidepanel'
Compress-Archive -Path $files -DestinationPath ..\gv-auto-dialer-webstore.zip -Force
```

Include the full `icons/` folder (Indus Web Agency logo + Chrome icon sizes).

## 3. Create the listing

In the Developer Dashboard → **New item** → upload the zip, then fill in:

### Suggested store description (paste / edit)

```
GV Auto Dialer by Indus Web Agency — a queue-based outbound dialer for Google Voice.

Import a CSV or Excel lead list, auto-dial contacts with a configurable delay, tag each call outcome, and export an XLSX call report — all from a Chrome side panel while you work in voice.google.com.

Made by Indus Web Agency (induswebagency.com). Perfect for sales teams, agencies, and solo dialers who already use Google Voice.

Getting started:
• Add to Chrome and open Google Voice (voice.google.com)
• Open the extension side panel
• Start a free 1-hour trial, or register and wait for approval
• Upload leads and start dialing

Access is subscription-based (trial, then plans from 1 day to 1 year). Contact Indus Web Agency to activate a paid plan. Each account works on one computer at a time.

Support: WhatsApp +92 307 9670503 · https://www.induswebagency.com

Keywords: Google Voice auto dialer, Indus Web Agency, outbound call queue, sales dialer, Google Voice dialer, lead calling, call report.
```

### Other listing fields

- **Category**: Productivity (or Business Tools if offered).
- **Language**, **Screenshots** (at least one, 1280×800 or 640×400 —
  side panel + HUD on Google Voice), **Small promo tile** optional.
- **Privacy practices**:
  - **Single purpose**: "Automates outbound dialing through a user's own Google Voice account from an imported contact list."
  - **Permission justifications**:
    - `storage` — save campaign state and login session on the device
    - `alarms` — periodic subscription re-check
    - `sidePanel` — dialer UI beside Google Voice
    - Host `voice.google.com` — drive the dialpad and read call UI
    - Host `gv-auto-dialer-accounts.vercel.app` — login, trial, subscription validation
  - **Privacy policy URL**: `https://gv-auto-dialer-accounts.vercel.app/privacy`
  - Declare you do **not** sell user data and limit use to the stated purpose.
- **Visibility**: **Public** for search, or **Unlisted** for link-only installs.

## 4. Submit for review

Typical review: a few hours to a few days. Host permissions get extra
scrutiny — accurate justifications above matter.

**Risk to know:** automating Google Voice may face Web Store scrutiny or
rejection, and high-volume automation can flag client Google accounts.
If public listing fails, use Unlisted or Load unpacked.

## 5. After approval — client flow

1. Client installs from the Web Store.
2. Side panel → **Register** (pending) or **Start free 1-hour trial**.
3. They pay you outside the extension.
4. You open `https://gv-auto-dialer-accounts.vercel.app/admin`, pick a
   plan, click **Activate**.
5. One device per account; **Log out** or admin **Reset device** to move.
6. When the plan expires, dialing locks until you activate again.

## 6. Shipping updates later

Bump `"version"` in `manifest.json`, re-zip, upload a new package on the
same listing, submit. Existing installs update automatically within hours.
