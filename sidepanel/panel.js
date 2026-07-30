/* ------------------------------------------------------------------
 * panel.js — the side panel is a pure view over the worker's state.
 * It never owns campaign data; it renders snapshots and sends intents.
 * ------------------------------------------------------------------ */

import { buildQueue, checkCallingWindow } from '../lib/phone.js';
import { parseLeadFile, downloadReport } from '../lib/report.js';

const $ = (id) => document.getElementById(id);
const port = chrome.runtime.connect({ name: 'gv-panel' });

let snapshot = null;

/* ================= inbound state ================= */

port.onMessage.addListener(({ type, payload }) => {
  if (type === 'STATE') render(payload);
  if (type === 'ACCOUNT') renderAccount(payload);
  if (type === 'AUTH_RESULT') {
    setAuthBusy(false);
    if (!payload.ok) $('authStatus').textContent = payload.reason || 'Failed — check your details and try again.';
  }
  if (type === 'REGISTER_RESULT') {
    setAuthBusy(false);
    $('authStatus').textContent = payload.ok
      ? (payload.message || 'Registered — waiting for approval.')
      : (payload.reason || 'Registration failed.');
  }
});
port.postMessage({ type: 'GET_STATE' });
port.postMessage({ type: 'GET_ACCOUNT' });

const send = (type, payload = {}) => port.postMessage({ type, payload });

/* ================= auth gate ================= */

let authMode = 'login'; // 'login' | 'register'

function setAuthBusy(busy) {
  for (const id of ['loginBtn', 'registerBtn', 'trialBtn']) $(id).disabled = busy;
}

$('authToggle').onclick = () => {
  authMode = authMode === 'login' ? 'register' : 'login';
  $('authTitle').textContent = authMode === 'login' ? 'Log in' : 'Register';
  $('loginFields').hidden = authMode !== 'login';
  $('registerFields').hidden = authMode !== 'register';
  $('authStatus').textContent = authMode === 'login'
    ? 'Enter your username and password to unlock this computer.'
    : 'New here? Register and wait for approval, or start a free trial.';
};

const AUTH_WAIT_HINT = 'Contacting server… Free hosting can take up to a minute to wake — please wait.';

$('loginBtn').onclick = () => {
  const username = $('loginUsername').value.trim();
  const password = $('loginPassword').value;
  if (!username || !password) { $('authStatus').textContent = 'Enter your username and password.'; return; }
  setAuthBusy(true);
  $('authStatus').textContent = AUTH_WAIT_HINT;
  send('LOGIN', { username, password });
};

$('registerBtn').onclick = () => {
  const username = $('regUsername').value.trim();
  const email = $('regEmail').value.trim();
  const password = $('regPassword').value;
  if (!username || password.length < 6) { $('authStatus').textContent = 'Choose a username and a password of at least 6 characters.'; return; }
  setAuthBusy(true);
  $('authStatus').textContent = AUTH_WAIT_HINT;
  send('REGISTER', { username, email, password });
};

$('trialBtn').onclick = () => {
  const username = $('regUsername').value.trim();
  const email = $('regEmail').value.trim();
  const password = $('regPassword').value;
  if (!username || password.length < 6) { $('authStatus').textContent = 'Choose a username and a password of at least 6 characters, then start the trial.'; return; }
  setAuthBusy(true);
  $('authStatus').textContent = AUTH_WAIT_HINT;
  send('START_TRIAL', { username, email, password });
};

$('logoutBtn').onclick = () => {
  if (confirm('Log out on this computer? You can log back in here or on another computer afterward.')) {
    send('LOGOUT');
  }
};

function renderAccount(acct) {
  const active = acct.status === 'active';
  $('appBody').hidden = !active;
  $('authCard').hidden = active;

  if (active) {
    const label = { trial_1h: '1-hour trial', day_1: '1 day', week_1: '1 week', days_15: '15 days', month_1: '1 month', year_1: '1 year' }[acct.plan] || acct.plan || 'Active';
    $('acctPlan').textContent = `${acct.username} — ${label}`;
    $('acctExpiry').textContent = acct.expiresAt ? `Access until ${new Date(acct.expiresAt).toLocaleString()}` : '';
    return;
  }

  $('loginUsername').value = acct.username || '';
  $('authStatus').textContent =
    acct.status === 'unknown' ? (authMode === 'login' ? 'Enter your username and password to unlock this computer.' : 'New here? Register and wait for approval, or start a free trial.')
    : acct.lastError || 'Not logged in.';
}

/* ================= import ================= */

$('uploadBtn').onclick = () => $('fileInput').click();

$('fileInput').onchange = async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  $('statusLine').textContent = `Reading ${file.name}…`;
  try {
    const rows = await parseLeadFile(file);
    if (!rows.length) throw new Error('That file has no data rows.');

    const { contacts, summary } = buildQueue(rows, { dncList: await loadDnc() });
    if (!contacts.length) {
      throw new Error('No dialable numbers found. Check the "Phone Number" column.');
    }

    send('LOAD_CONTACTS', { contacts, summary });
    showSummary(summary);
  } catch (err) {
    $('statusLine').textContent = err.message;
  } finally {
    e.target.value = ''; // allow re-uploading the same file
  }
};

async function loadDnc() {
  const { dncList } = await chrome.storage.local.get('dncList');
  return dncList || [];
}

function showSummary(s) {
  $('sumTotal').textContent = s.total;
  $('sumValid').textContent = s.valid;
  $('sumInvalid').textContent = s.invalid;
  $('sumDupe').textContent = s.duplicate;
  $('sumSuppressed').textContent = s.suppressed;
  $('sumReady').textContent = s.readyToDial;
  $('summaryCard').hidden = false;
}

$('dismissSummary').onclick = () => { $('summaryCard').hidden = true; };

/* ================= controls ================= */

$('delaySelect').onchange = (e) => send('SET_DELAY', { seconds: e.target.value });
$('windowToggle').onchange = (e) => send('SET_WINDOW_ENFORCEMENT', { enabled: e.target.checked });
$('hangupBtn').onclick = () => send('HANGUP');

$('primaryBtn').onclick = () => {
  const s = snapshot?.status;
  if (s === 'running' || s === 'awaiting_outcome') send('STOP');
  else if (s === 'paused') send('RESUME');
  else send('START');
};

$('resetBtn').onclick = () => {
  if (confirm('Clear the current campaign and all call results?')) send('RESET');
};

document.getElementById('outcomeGrid').addEventListener('click', (e) => {
  const btn = e.target.closest('[data-outcome]');
  if (btn) send('OUTCOME', { result: btn.dataset.outcome });
});

$('downloadBtn').onclick = () => {
  try {
    const n = downloadReport(snapshot.contacts);
    $('statusLine').textContent = `Exported ${n} call records.`;
  } catch (err) {
    $('statusLine').textContent = err.message;
  }
};

/* ================= render ================= */

function render(v) {
  snapshot = v;
  const { stats, current, status } = v;

  $('stTotal').textContent = stats.total;
  $('stCompleted').textContent = stats.completed;
  $('stReady').textContent = stats.readyToDial;
  $('stAnswered').textContent = stats.answered;
  $('stVoicemail').textContent = stats.voicemail;
  $('stFailed').textContent = stats.failed;
  $('progressBar').style.width = `${stats.percent}%`;

  $('delaySelect').value = String(v.dialDelaySeconds);
  $('windowToggle').checked = v.enforceCallingWindow;
  $('statusLine').textContent = v.statusText || '';

  // Primary button reflects what pressing it will do, and keeps its
  // name through the flow.
  const btn = $('primaryBtn');
  btn.classList.toggle('btn--stop', status === 'running' || status === 'awaiting_outcome');
  btn.classList.toggle('btn--go', !(status === 'running' || status === 'awaiting_outcome'));
  btn.disabled = stats.total === 0 || status === 'finished';
  btn.textContent =
    status === 'running' || status === 'awaiting_outcome' ? 'Stop dialing'
    : status === 'paused' ? 'Resume dialing'
    : 'Start dialing';

  // Live call card
  const live = !!current && (status === 'running' || status === 'awaiting_outcome');
  $('liveCard').hidden = !live;
  if (live) {
    $('liveName').textContent = current.name || 'Unknown contact';
    $('liveNumber').textContent = current.pretty;
    $('livePosition').textContent = `Contact ${v.position} of ${stats.total}`;
    $('liveTimer').textContent = v.statusText.startsWith('In call')
      ? v.statusText
      : `In call: ${current.durationSeconds ?? 0}s`;
    $('liveBadge').textContent = status === 'awaiting_outcome' ? 'Call ended' : 'Active call';

    // Outcome buttons only matter once the call is over.
    const awaiting = status === 'awaiting_outcome';
    for (const b of document.querySelectorAll('[data-outcome]')) b.disabled = !awaiting;
    $('hangupBtn').disabled = awaiting;

    // Surface a compliance warning without blocking the operator.
    if (v.enforceCallingWindow && current.e164) {
      const w = checkCallingWindow(current.e164);
      if (!w.allowed) $('statusLine').textContent = `Outside calling window — ${w.reason}`;
    }
  }

  // Completion card
  const done = status === 'finished';
  $('doneCard').hidden = !done;
  if (done) {
    $('dnTotal').textContent = stats.total;
    $('dnAnswered').textContent = stats.answered;
    $('dnVoicemail').textContent = stats.voicemail;
  }

  $('downloadBtn').hidden = !(stats.completed + stats.failed);
}
