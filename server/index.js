/* ------------------------------------------------------------------
 * index.js — accounts API + admin dashboard.
 *
 * There is no payment processor here. You collect payment yourself,
 * however you like, and then log into /admin (protected by
 * ADMIN_USER / ADMIN_PASSWORD) to approve the client and pick how long
 * their access lasts. The extension only ever talks to /api/*.
 *
 * Flow:
 *   1. Client opens the extension, registers a username/password
 *      (status starts 'pending'), or starts a free 1-hour trial
 *      (auto-activated, one per device).
 *   2. You see them in /admin, collect payment outside this system,
 *      click Activate, pick a plan (1 day / week / 15 days / month /
 *      year), which sets an expiry.
 *   3. Client logs in from the extension. The FIRST device to log in
 *      gets bound to that account; every other device is rejected with
 *      "device_mismatch" until the account owner logs out (which frees
 *      the device) or you reset it from /admin.
 *   4. The extension re-checks /api/validate every 30 minutes and
 *      before every "Start dialing" — once status flips to expired or
 *      disabled, dialing stops.
 * ------------------------------------------------------------------ */

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { pool, init } = require('./db');
const { hashPassword, verifyPassword, generateToken, PLAN_DURATIONS_MS, PLAN_LABELS } = require('./auth');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

/* ================= helpers ================= */

/** Flip a lapsed row to 'expired' and return the up-to-date status. */
async function settleExpiry(user) {
  if (user.status === 'active' && user.expires_at && new Date(user.expires_at) <= new Date()) {
    await pool.query(`update users set status = 'expired' where id = $1`, [user.id]);
    user.status = 'expired';
  }
  return user;
}

function reasonText(reason) {
  switch (reason) {
    case 'username_taken': return 'That username is already registered.';
    case 'not_found': return 'Account not found.';
    case 'bad_credentials': return 'Incorrect username or password.';
    case 'pending': return 'Your account is registered but not approved yet — contact the seller.';
    case 'disabled': return 'This account has been disabled.';
    case 'expired': return 'Your subscription has expired — contact the seller to renew.';
    case 'device_mismatch': return 'This account is already logged in on another computer. Log out there first.';
    case 'trial_used_on_device': return 'A free trial has already been used on this computer.';
    default: return reason || 'Something went wrong.';
  }
}

/* ================= extension-facing API ================= */

app.post('/api/register', async (req, res) => {
  const { username, password, email } = req.body || {};
  if (!username || !password || password.length < 6) {
    return res.status(400).json({ ok: false, reason: 'Username and a password of at least 6 characters are required.' });
  }
  try {
    await pool.query(
      `insert into users (username, email, password_hash, status) values ($1, $2, $3, 'pending')`,
      [username.trim(), (email || '').trim() || null, hashPassword(password)]
    );
    res.json({ ok: true, message: 'Registered — waiting for approval.' });
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ ok: false, reason: reasonText('username_taken') });
    console.error(err);
    res.status(500).json({ ok: false, reason: 'Server error.' });
  }
});

app.post('/api/trial', async (req, res) => {
  const { username, password, email, deviceId } = req.body || {};
  if (!username || !password || password.length < 6 || !deviceId) {
    return res.status(400).json({ ok: false, reason: 'Username, a password of at least 6 characters, and device id are required.' });
  }

  const { rows: existingTrial } = await pool.query(
    `select id from users where device_id = $1 and plan = 'trial_1h'`,
    [deviceId]
  );
  if (existingTrial.length) {
    return res.status(403).json({ ok: false, reason: reasonText('trial_used_on_device') });
  }

  const expiresAt = new Date(Date.now() + PLAN_DURATIONS_MS.trial_1h);
  try {
    const { rows } = await pool.query(
      `insert into users (username, email, password_hash, status, plan, expires_at, device_id, device_bound_at, trial_used, approved_at)
       values ($1, $2, $3, 'active', 'trial_1h', $4, $5, now(), true, now())
       returning id`,
      [username.trim(), (email || '').trim() || null, hashPassword(password), expiresAt, deviceId]
    );
    const token = generateToken();
    await pool.query(`insert into sessions (token, user_id, device_id) values ($1, $2, $3)`, [token, rows[0].id, deviceId]);
    res.json({ ok: true, token, plan: 'trial_1h', expiresAt });
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ ok: false, reason: reasonText('username_taken') });
    console.error(err);
    res.status(500).json({ ok: false, reason: 'Server error.' });
  }
});

app.post('/api/login', async (req, res) => {
  const { username, password, deviceId } = req.body || {};
  if (!username || !password || !deviceId) return res.status(400).json({ ok: false, reason: 'Missing fields.' });

  const { rows } = await pool.query('select * from users where username = $1', [username.trim()]);
  let user = rows[0];
  if (!user) return res.status(404).json({ ok: false, reason: reasonText('not_found') });
  if (!verifyPassword(password, user.password_hash)) {
    return res.status(401).json({ ok: false, reason: reasonText('bad_credentials') });
  }

  user = await settleExpiry(user);
  if (user.status !== 'active') return res.status(403).json({ ok: false, reason: reasonText(user.status) });

  if (!user.device_id) {
    await pool.query('update users set device_id = $1, device_bound_at = now() where id = $2', [deviceId, user.id]);
  } else if (user.device_id !== deviceId) {
    return res.status(409).json({ ok: false, reason: reasonText('device_mismatch') });
  }

  await pool.query('delete from sessions where user_id = $1', [user.id]); // one active session at a time
  const token = generateToken();
  await pool.query('insert into sessions (token, user_id, device_id) values ($1, $2, $3)', [token, user.id, deviceId]);

  res.json({ ok: true, token, plan: user.plan, expiresAt: user.expires_at });
});

app.post('/api/validate', async (req, res) => {
  const { username, token, deviceId } = req.body || {};
  if (!username || !token || !deviceId) return res.status(400).json({ ok: false, reason: 'Missing fields.' });

  const { rows } = await pool.query(
    `select u.* from sessions s join users u on u.id = s.user_id where s.token = $1 and u.username = $2`,
    [token, username.trim()]
  );
  let user = rows[0];
  if (!user) return res.status(404).json({ ok: false, reason: reasonText('not_found') });
  if (user.device_id !== deviceId) return res.status(409).json({ ok: false, reason: reasonText('device_mismatch') });

  user = await settleExpiry(user);
  if (user.status !== 'active') return res.status(403).json({ ok: false, reason: reasonText(user.status) });

  res.json({ ok: true, plan: user.plan, expiresAt: user.expires_at });
});

app.post('/api/logout', async (req, res) => {
  const { username, token } = req.body || {};
  if (!username || !token) return res.status(400).json({ ok: false, reason: 'Missing fields.' });
  const { rows } = await pool.query(
    `select u.id from sessions s join users u on u.id = s.user_id where s.token = $1 and u.username = $2`,
    [token, username.trim()]
  );
  if (rows[0]) {
    await pool.query('delete from sessions where token = $1', [token]);
    await pool.query('update users set device_id = null, device_bound_at = null where id = $1', [rows[0].id]);
  }
  res.json({ ok: true });
});

/* ================= admin dashboard ================= */

function requireAdmin(req, res, next) {
  const header = req.headers.authorization || '';
  const [scheme, encoded] = header.split(' ');
  const [user, pass] = scheme === 'Basic' && encoded ? Buffer.from(encoded, 'base64').toString().split(':') : [];
  if (user === process.env.ADMIN_USER && pass === process.env.ADMIN_PASSWORD && process.env.ADMIN_PASSWORD) {
    return next();
  }
  res.set('WWW-Authenticate', 'Basic realm="Admin"');
  return res.status(401).send('Authentication required');
}

app.use('/admin', requireAdmin);

const PLAN_OPTIONS = Object.entries(PLAN_LABELS)
  .map(([value, label]) => `<option value="${value}">${label}</option>`)
  .join('');

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function fmt(d) {
  return d ? new Date(d).toLocaleString() : '—';
}

app.get('/admin', async (req, res) => {
  const { rows: users } = await pool.query('select * from users order by created_at desc');
  const now = Date.now();

  const rowsHtml = users.map((u) => {
    const expired = u.expires_at && new Date(u.expires_at).getTime() <= now;
    const statusLabel = expired && u.status === 'active' ? 'expired' : u.status;
    const statusColor = { active: '#1ece80', pending: '#f0a92e', disabled: '#cb1127', expired: '#cb1127' }[statusLabel] || '#8b98b0';
    return `
      <tr>
        <td>${u.id}</td>
        <td><b>${esc(u.username)}</b><br><span class="muted">${esc(u.email || '')}</span></td>
        <td><span style="color:${statusColor};font-weight:700">${esc(statusLabel)}</span></td>
        <td>${esc(PLAN_LABELS[u.plan] || u.plan || '—')}</td>
        <td>${fmt(u.expires_at)}</td>
        <td>${u.device_id ? 'bound' : '—'}</td>
        <td>${fmt(u.created_at)}</td>
        <td class="actions">
          <form method="post" action="/admin/users/${u.id}/activate">
            <select name="plan">${PLAN_OPTIONS}</select>
            <button type="submit">Activate</button>
          </form>
          <form method="post" action="/admin/users/${u.id}/disable"><button type="submit">Disable</button></form>
          <form method="post" action="/admin/users/${u.id}/reset-device"><button type="submit">Reset device</button></form>
          <form method="post" action="/admin/users/${u.id}/delete" onsubmit="return confirm('Delete ${esc(u.username)} permanently?')"><button type="submit" class="danger">Delete</button></form>
        </td>
      </tr>`;
  }).join('');

  res.send(`<!doctype html><html><head><meta charset="utf-8"><title>Admin — Auto Dialer accounts</title>
    <style>
      body { font-family: system-ui, sans-serif; background: #0b0e19; color: #e8edf7; margin: 0; padding: 24px; }
      h1 { font-size: 18px; }
      table { width: 100%; border-collapse: collapse; font-size: 13px; }
      th, td { padding: 8px 10px; border-bottom: 1px solid #2a3648; text-align: left; vertical-align: top; }
      th { color: #8b98b0; font-size: 11px; text-transform: uppercase; letter-spacing: .05em; }
      .muted { color: #8b98b0; font-size: 11px; }
      .actions form { display: inline-block; margin: 2px 4px 2px 0; }
      select, button, input { font: inherit; padding: 5px 8px; border-radius: 5px; border: 1px solid #2a3648; background: #1d2739; color: #e8edf7; }
      button { cursor: pointer; }
      button:hover { background: #253044; }
      button.danger { background: #76121d; border-color: #76121d; }
      .card { background: #0f1528; border: 1px solid #2a3648; border-radius: 10px; padding: 16px; margin-bottom: 20px; }
    </style></head>
    <body>
      <h1>Auto Dialer — account admin</h1>

      <div class="card">
        <h2 style="font-size:13px;margin-top:0">Add a user manually</h2>
        <form method="post" action="/admin/users">
          <input name="username" placeholder="username" required>
          <input name="email" placeholder="email (optional)">
          <input name="password" placeholder="password" required>
          <select name="plan"><option value="">Leave pending</option>${PLAN_OPTIONS}</select>
          <button type="submit">Create</button>
        </form>
      </div>

      <table>
        <thead><tr>
          <th>ID</th><th>User</th><th>Status</th><th>Plan</th><th>Expires</th><th>Device</th><th>Registered</th><th>Actions</th>
        </tr></thead>
        <tbody>${rowsHtml || '<tr><td colspan="8" class="muted">No accounts yet.</td></tr>'}</tbody>
      </table>
    </body></html>`);
});

app.post('/admin/users', async (req, res) => {
  const { username, password, email, plan } = req.body || {};
  if (!username || !password) return res.redirect('/admin');
  const active = !!plan;
  const expiresAt = active ? new Date(Date.now() + PLAN_DURATIONS_MS[plan]) : null;
  try {
    await pool.query(
      `insert into users (username, email, password_hash, status, plan, expires_at, approved_at)
       values ($1, $2, $3, $4, $5, $6, $7)`,
      [username.trim(), (email || '').trim() || null, hashPassword(password), active ? 'active' : 'pending', plan || null, expiresAt, active ? new Date() : null]
    );
  } catch (err) {
    console.error(err);
  }
  res.redirect('/admin');
});

app.post('/admin/users/:id/activate', async (req, res) => {
  const plan = req.body?.plan;
  const duration = PLAN_DURATIONS_MS[plan];
  if (duration) {
    const expiresAt = new Date(Date.now() + duration);
    await pool.query(
      `update users set status = 'active', plan = $1, expires_at = $2, approved_at = now() where id = $3`,
      [plan, expiresAt, req.params.id]
    );
  }
  res.redirect('/admin');
});

app.post('/admin/users/:id/disable', async (req, res) => {
  await pool.query(`update users set status = 'disabled' where id = $1`, [req.params.id]);
  await pool.query(`delete from sessions where user_id = $1`, [req.params.id]); // kick them off now, not on next poll
  res.redirect('/admin');
});

app.post('/admin/users/:id/reset-device', async (req, res) => {
  await pool.query(`update users set device_id = null, device_bound_at = null where id = $1`, [req.params.id]);
  await pool.query(`delete from sessions where user_id = $1`, [req.params.id]);
  res.redirect('/admin');
});

app.post('/admin/users/:id/delete', async (req, res) => {
  await pool.query(`delete from users where id = $1`, [req.params.id]);
  res.redirect('/admin');
});

/* ================= misc ================= */

app.get('/privacy', (req, res) => {
  res.send(`<!doctype html><html><head><meta charset="utf-8"><title>Privacy Policy</title></head>
    <body style="font-family:system-ui,sans-serif;max-width:640px;margin:40px auto;color:#1d2739;line-height:1.5">
      <h1>Privacy Policy — Google Voice Enterprise Auto Dialer</h1>
      <p><em>Last updated: ${new Date().toISOString().slice(0, 10)}</em></p>
      <p>This extension runs mostly in your browser. Contact lists you upload,
      call outcomes, and campaign progress are stored locally in Chrome's
      <code>chrome.storage.local</code> on your own device.</p>
      <p>To provide subscription access, the extension sends your chosen
      username, a hashed (not plaintext) password, and a randomly generated
      device identifier to our server, which is used solely to authenticate
      you and enforce one active device per account. We do not sell or
      share this data with third parties.</p>
      <p>Payment for a subscription is arranged directly with the seller
      outside of this extension; no card details are processed by this
      software.</p>
      <p>Questions: contact the seller you subscribed through.</p>
    </body></html>`);
});

app.get('/health', (req, res) => res.json({ ok: true }));

const port = process.env.PORT || 3000;
init()
  .then(() => app.listen(port, () => console.log(`Accounts server listening on ${port}`)))
  .catch((err) => {
    console.error('Failed to initialize database:', err);
    process.exit(1);
  });
