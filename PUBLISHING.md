# Publishing to the Chrome Web Store

Goal: a client can search the Chrome Web Store, find the extension,
install it, register or log in, and — once you've approved them from
your admin page and set how long their access lasts — use it, locked
to that one computer.

Do this **after** the accounts server in `server/` is deployed and
`config.js` / `manifest.json` point at it (see `server/README.md`) —
the Web Store review will actually exercise the login flow.

## 1. Developer account (one time)

1. Go to `chrome.google.com/webstore/devconsole`, sign in with the
   Google account you want to own this extension.
2. Pay the one-time **$5 registration fee**.

## 2. Package the extension

Zip the **contents** of the extension folder (not the folder itself —
`manifest.json` must be at the root of the zip):

```
manifest.json
config.js
background.js
content/
icons/
lib/
sidepanel/
```

Do **not** include `server/`, `test/`, `README.md`, `PUBLISHING.md`, or
`.git` — they're not needed at runtime and just add review noise. (The
Web Store doesn't care if you leave them in, but a smaller package
reviews faster.)

## 3. Create the listing

In the Developer Dashboard → **New item** → upload the zip, then fill in:

- **Store listing → Description**: what it does, who it's for. Since
  you want clients to *find* it by searching, put the terms they'd
  actually search for in the first couple of sentences — e.g. "Google
  Voice auto dialer," "outbound call queue," "sales dialer for Google
  Voice" — Chrome Web Store search weights the title and early
  description text. Mention that it's subscription-based and how to
  get access (e.g. "contact [you] to register").
- **Category**: Productivity (or Business Tools if offered in your region).
- **Language**, **Screenshots** (at least one, 1280×800 or 640×400 —
  screenshot the side panel and the HUD in action), **Small promo tile**
  (optional but improves how it looks in search results).
- **Privacy practices tab**: this is the part people miss and get
  rejected on.
  - **Single purpose**: describe it as one sentence — "Automates
    outbound dialing through a user's own Google Voice account from an
    imported contact list."
  - **Permission justifications**: explain `storage` (save campaign
    state and login session locally) and `alarms` (periodic
    subscription check) in plain language — the review form asks for
    this per permission.
  - **Privacy policy URL**: use `https://YOUR-RENDER-URL.onrender.com/privacy`
    (already built into the server — see `server/index.js`).
  - Declare that you do **not** sell user data and **do** limit use to
    the extension's stated purpose — both must be checked truthfully
    to pass review.
- **Visibility**: set to **Public** so it's searchable (this is the
  setting that satisfies "client should come to Google and search for
  it" — Unlisted would hide it from search).

## 4. Submit for review

Typical review time is a few hours to a few days. Extensions that
request host permissions (this one does, for `voice.google.com` and
your accounts server) get a closer look — the accurate permission
justifications from step 3 are what get it through cleanly.

**One thing to flag to Google reviewers and to yourself honestly:**
this extension automates clicking through Google's own web UI, which
Google's Terms of Service for Voice don't explicitly sanction, and the
extension's own README says so. That's a real risk for your clients'
Google accounts (Google can flag/restrict an account doing heavy
automated dialing), not something this fixes — worth stating clearly
in your own terms of service so clients accept that risk knowingly
before they register, and worth knowing the Web Store listing itself
could face extra scrutiny or rejection because of it. If that happens,
the fallback is unlisted distribution (send installers the direct
Web Store link, which still auto-updates, just doesn't show up in
public search) or self-hosted `.crx` distribution.

## 5. After approval — the client experience

1. Client searches the Web Store, finds it by name, clicks **Add to Chrome**.
2. They open the side panel and either:
   - click **Register**, choose a username/password — sits as
     "pending" until you approve it, or
   - click **Start free 1-hour trial** to try it immediately.
3. They pay you directly, however you've arranged that, outside the extension.
4. You open `https://YOUR-RENDER-URL.onrender.com/admin`, find their
   account, pick a plan (1 day / week / 15 days / month / year) from
   the dropdown, click **Activate**.
5. They log in — it's now locked to that computer. If they try the
   same account on a second machine, the extension shows "already
   logged in on another computer" until they hit **Log out** on the
   first one (or you hit **Reset device** in `/admin`).
6. When their time is up, the extension disables dialing automatically
   — no action needed from you unless they're paying again, in which
   case just **Activate** them again with a new plan.

## 6. Shipping updates later

Bump `"version"` in `manifest.json`, re-zip, upload as a new package in
the same Developer Dashboard listing, submit. Existing installs update
automatically within a few hours — clients don't reinstall anything.
