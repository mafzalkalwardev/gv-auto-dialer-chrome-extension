/* ------------------------------------------------------------------
 * db.js — Postgres connection + schema bootstrap.
 *
 * Two tables:
 *   users    — one row per client account. You (the admin) control
 *              status/plan/expires_at by hand from /admin after they
 *              pay you directly (no payment processor involved).
 *   sessions — one row per logged-in device. A user can only ever have
 *              ONE row here at a time (see auth.js) — that's what
 *              enforces "one device per account."
 * ------------------------------------------------------------------ */

const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL && !process.env.DATABASE_URL.includes('localhost')
    ? { rejectUnauthorized: false }
    : false,
  // Free Render Postgres can suspend; fail the request instead of hanging forever.
  connectionTimeoutMillis: 30_000,
  idleTimeoutMillis: 10_000,
});

async function init() {
  await pool.query(`
    create table if not exists users (
      id serial primary key,
      username text unique not null,
      email text,
      password_hash text not null,
      status text not null default 'pending', -- pending | active | disabled | expired
      plan text,                               -- trial_1h | day_1 | week_1 | days_15 | month_1 | year_1
      expires_at timestamptz,
      device_id text,
      device_bound_at timestamptz,
      trial_used boolean not null default false,
      created_at timestamptz not null default now(),
      approved_at timestamptz
    );
  `);

  await pool.query(`
    create table if not exists sessions (
      token text primary key,
      user_id integer not null references users(id) on delete cascade,
      device_id text not null,
      created_at timestamptz not null default now()
    );
  `);

  await pool.query(`create index if not exists sessions_user_idx on sessions (user_id);`);
  // Trial abuse guard: block a second free trial from the same physical
  // device even under a brand-new username.
  await pool.query(`create index if not exists users_device_idx on users (device_id);`);
}

module.exports = { pool, init };
