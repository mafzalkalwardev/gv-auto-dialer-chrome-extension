# Accounts server — deploy guide (no command line needed)

This is the piece that turns the extension into a subscription product
you control entirely by hand: clients register or start a free trial
from inside the extension, you collect payment however you like
outside this system (bank transfer, cash, whatever), then you approve
them from a password-protected `/admin` page and pick how long their
access lasts. No Stripe, no payment processor involved.

You need two things: a **Render** account (free to create) to host this
server + its database, and — separately, once the server's live — a
**Chrome Web Store** developer account for the extension itself (see
`../PUBLISHING.md`).

## 1. Render — host the server + database

1. Go to render.com → sign up → connect your GitHub account.
2. **New → PostgreSQL.** Give it a name, pick the free/starter plan,
   create it. Once it's up, copy the **Internal Database URL** shown on
   its page.
3. **New → Web Service.** Pick the `gv-auto-dialer` GitHub repo, set
   **Root Directory** to `server`, **Build Command** to `npm install`,
   **Start Command** to `npm start`.
4. Under **Environment**, add:
   - `DATABASE_URL` → the Internal Database URL from step 2
   - `ADMIN_USER` → whatever username you want for the admin page
   - `ADMIN_PASSWORD` → a long, random password — this page controls
     every client's access, treat it like a master key
5. Deploy. Render gives you a URL like
   `https://gv-auto-dialer-abc1.onrender.com` — that's your
   `ACCOUNTS_API_BASE`.

## 2. Point the extension at your server

In the extension folder, edit `config.js`:

```js
export const LICENSE_API_BASE = 'https://gv-auto-dialer-abc1.onrender.com';
```

And in `manifest.json`, replace the placeholder host permission with
the same domain:

```json
"host_permissions": ["https://voice.google.com/*", "https://gv-auto-dialer-abc1.onrender.com/*"]
```

## 3. Try it end to end

1. Load the extension unpacked (see the main `README.md`), open the
   side panel — you'll land on the Register/Login screen.
2. Click **Start free 1-hour trial**, pick a username/password — it
   should unlock the dialer immediately, and you'll see a countdown.
3. Visit `https://gv-auto-dialer-abc1.onrender.com/admin`, log in with
   `ADMIN_USER` / `ADMIN_PASSWORD` — you should see that trial account
   in the table.
4. Register a second account from the extension (**Register** tab, not
   trial) — it'll say "waiting for approval." In `/admin`, find that
   user, pick a plan from the dropdown (1 day / week / 15 days / month
   / year), click **Activate**. Log in from the extension — it should
   now unlock.
5. Try logging into that same account from a second computer (or a
   second Chrome profile) — it should be rejected with "already logged
   in on another computer," proving the one-device lock works. Use
   **Log out** on the first device to free it, then the second can log
   in.
6. In `/admin`, click **Disable** on a live account — within ~30
   minutes (or immediately if they hit Start dialing) the extension
   will lock them out. **Reset device** frees a seat without disabling
   the account, useful when a client gets a new computer.

## What you manage where

- **`/admin`** — literally everything: who can log in, what plan
  they're on, when they expire, disabling accounts, freeing a device
  slot for a client who switched computers.
- **Render → your Postgres → Shell/Connect** — direct SQL access if you
  ever need to fix something by hand.
- **Render → your web service → Logs** — see logins, registrations, and
  errors live.

## A note on trust

There's no email verification and no payment gateway here — it's
deliberately minimal because you said you'd rather run this by hand.
That means: anyone can register a username, and it sits as `pending`
until you look at `/admin` and decide whether to activate it. Only
activate accounts for people you've actually been paid by. The 1-hour
trial has a lightweight abuse guard (one trial per physical device,
not just per username), but a determined person could still work
around it — treat the trial as a convenience for genuine prospects, not
a hard limit.
