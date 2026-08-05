/* ------------------------------------------------------------------
 * inject.js — runs on voice.google.com
 *
 * Responsibilities:
 *   1. Drive the dialpad (type a number, press call, hang up).
 *   2. Detect call state transitions and report them upstream.
 *   3. Render the draggable on-page "Dialer HUD".
 *
 * It holds NO queue state. The service worker owns the campaign; this
 * script is a pair of hands and a pair of eyes.
 * ------------------------------------------------------------------ */

(() => {
  'use strict';

  const POLL_MS = 400;

  let port = null;
  let watcher = null;
  let callState = 'idle';         // idle | dialing | connected | ended
  let callStartedAt = null;
  let lastSeenTimer = null;
  let sawLiveCall = false;         // true once hangup UI has appeared
  const DIAL_UI_GRACE_MS = 4000;   // hangup control can lag after click

  /* ================= messaging ================= */

  function extensionAlive() {
    try {
      return Boolean(chrome.runtime?.id);
    } catch (_) {
      return false;
    }
  }

  function connect() {
    // After an extension reload, old content scripts keep running but their
    // chrome.runtime binding is dead ("Extension context invalidated").
    if (!extensionAlive()) {
      stopWatching();
      return;
    }
    try {
      port = chrome.runtime.connect({ name: 'gv-content' });
      port.onMessage.addListener(handleCommand);
      port.onDisconnect.addListener(() => {
        port = null;
        if (!extensionAlive()) {
          stopWatching();
          return;
        }
        setTimeout(connect, 1000); // service worker recycled; reattach
      });
    } catch (_) {
      stopWatching();
    }
  }

  function send(type, payload = {}) {
    if (!extensionAlive() || !port) return;
    try { port.postMessage({ type, payload }); } catch (_) {}
  }

  async function handleCommand({ type, payload }) {
    switch (type) {
      case 'DIAL':
        await dial(payload.number).catch((err) =>
          send('DIAL_FAILED', { number: payload.number, reason: err.message })
        );
        break;
      case 'HANGUP':
        hangup();
        break;
      case 'HUD_UPDATE':
        renderHud(payload);
        break;
      case 'PING':
        send('PONG', { href: location.href });
        break;
    }
  }

  /* ================= dialpad control ================= */

  /**
   * Google Voice's input is React-controlled: assigning `.value` directly
   * updates the DOM but never the React state, so the call button stays
   * disabled. We call the *native* value setter, which React's synthetic
   * event system does observe.
   */
  function setControlledValue(el, value) {
    const proto = el instanceof HTMLTextAreaElement
      ? HTMLTextAreaElement.prototype
      : HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto, 'value').set;
    setter.call(el, value);
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }

  async function dial(number) {
    send('STATUS', { text: `Entering number ${number}…` });

    const input = await GVSel.waitFor('dialInput');
    input.focus();
    setControlledValue(input, '');
    await sleep(80);
    setControlledValue(input, number);
    await sleep(400); // let Google Voice validate + enable the call button

    const btn = GVSel.find('callButton');
    if (!btn) throw new Error('Call button not found — run GVSel.probe()');
    if (btn.getAttribute('aria-disabled') === 'true' || btn.disabled) {
      throw new Error('Call button is disabled — number may be invalid');
    }

    btn.click();
    callState = 'dialing';
    callStartedAt = Date.now();
    sawLiveCall = false;
    lastSeenTimer = null;
    send('CALL_STARTED', { number, at: new Date().toISOString() });
    startWatching();
  }

  function hangup() {
    const btn = GVSel.find('hangupButton');
    if (btn) btn.click();
  }

  /* ================= call state detection ================= */

  function startWatching() {
    stopWatching();
    watcher = setInterval(evaluate, POLL_MS);
    evaluate();
  }

  function stopWatching() {
    if (watcher) clearInterval(watcher);
    watcher = null;
  }

  function readTimer() {
    const el = GVSel.find('callTimer');
    if (!el) return null;
    const m = (el.innerText || '').match(/(\d{1,2}):(\d{2})(?::(\d{2}))?/);
    if (!m) return null;
    return m[3]
      ? (+m[1]) * 3600 + (+m[2]) * 60 + (+m[3])
      : (+m[1]) * 60 + (+m[2]);
  }

  function evaluate() {
    const live = !!GVSel.find('hangupButton');
    const secs = readTimer();
    if (secs !== null) lastSeenTimer = secs;
    if (live) sawLiveCall = true;

    if (live && callState === 'dialing') {
      callState = 'connected';
      send('CALL_CONNECTED', { at: new Date().toISOString() });
    }

    if (live) {
      send('CALL_TICK', { seconds: secs ?? Math.round((Date.now() - callStartedAt) / 1000) });
      return;
    }

    // Hangup control is missing. Do not treat as "ended" until we've either
    // seen a live call UI, or waited out the post-dial grace window.
    if (callState === 'dialing') {
      if (!sawLiveCall && Date.now() - callStartedAt < DIAL_UI_GRACE_MS) return;
      const duration = lastSeenTimer ?? Math.round((Date.now() - callStartedAt) / 1000);
      const hadLive = sawLiveCall;
      callState = 'ended';
      stopWatching();
      lastSeenTimer = null;
      sawLiveCall = false;
      if (!hadLive) {
        send('DIAL_FAILED', { reason: 'Call UI did not appear — check Google Voice selectors' });
      } else {
        send('CALL_ENDED', { durationSeconds: duration, at: new Date().toISOString() });
      }
      return;
    }

    if (callState === 'connected') {
      const duration = lastSeenTimer ?? Math.round((Date.now() - callStartedAt) / 1000);
      callState = 'ended';
      stopWatching();
      lastSeenTimer = null;
      sawLiveCall = false;
      send('CALL_ENDED', { durationSeconds: duration, at: new Date().toISOString() });
    }
  }

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  /* ================= on-page HUD ================= */

  let hud = null;

  function buildHud() {
    hud = document.createElement('div');
    hud.id = 'gvad-hud';
    hud.innerHTML = `
      <div class="gvad-hud__bar">
        <span class="gvad-hud__grip" aria-hidden="true">⠿</span>
        <span class="gvad-hud__title">Dialer HUD</span>
        <span class="gvad-hud__count" data-hud="count">0/0</span>
      </div>
      <div class="gvad-hud__body">
        <div class="gvad-hud__label">Active contact</div>
        <div class="gvad-hud__name" data-hud="name">—</div>
        <div class="gvad-hud__num" data-hud="number"></div>
        <div class="gvad-hud__label">Queue progress</div>
        <div class="gvad-hud__track"><i data-hud="bar"></i></div>
        <div class="gvad-hud__status" data-hud="status">Idle</div>
        <div class="gvad-hud__outcomes" data-hud="outcomes" hidden>
          <div class="gvad-hud__label">Select outcome</div>
          <div class="gvad-hud__grid">
            <button type="button" data-outcome="Answered">Answered</button>
            <button type="button" data-outcome="Voicemail">Voicemail</button>
            <button type="button" data-outcome="Busy">Busy</button>
            <button type="button" data-outcome="No Answer">No answer</button>
            <button type="button" data-outcome="Wrong Number">Wrong no.</button>
            <button type="button" data-outcome="Disconnected">Disconn.</button>
            <button type="button" data-outcome="Callback">Callback</button>
            <button type="button" class="is-ok" data-outcome="Interested">Interested</button>
            <button type="button" class="is-bad" data-outcome="Not Interested">Not int.</button>
          </div>
        </div>
        <div class="gvad-hud__actions">
          <button type="button" data-hud-action="hangup">End call</button>
          <button type="button" class="is-danger" data-hud-action="stop">Stop dialing</button>
        </div>
      </div>`;
    document.body.appendChild(hud);

    hud.querySelector('[data-hud-action="hangup"]').onclick = hangup;
    hud.querySelector('[data-hud-action="stop"]').onclick = () => send('STOP_REQUESTED');
    hud.querySelector('.gvad-hud__grid').addEventListener('click', (e) => {
      const btn = e.target.closest('[data-outcome]');
      if (!btn || btn.disabled) return;
      send('OUTCOME_SELECTED', { result: btn.getAttribute('data-outcome') });
    });
    makeDraggable(hud, hud.querySelector('.gvad-hud__bar'));
  }

  function renderHud({ name, number, index, total, status, percent, visible, awaitingOutcome, inCall }) {
    if (!hud) buildHud();
    hud.style.display = visible === false ? 'none' : 'block';
    const set = (k, v) => {
      const el = hud.querySelector(`[data-hud="${k}"]`);
      if (el && v !== undefined) el.textContent = v;
    };
    set('name', name || '—');
    set('number', number || '');
    set('count', `${index ?? 0}/${total ?? 0}`);
    set('status', status || '');
    const bar = hud.querySelector('[data-hud="bar"]');
    if (bar && percent !== undefined) bar.style.width = `${percent}%`;

    const outcomes = hud.querySelector('[data-hud="outcomes"]');
    if (outcomes) outcomes.hidden = !awaitingOutcome;
    hud.classList.toggle('is-awaiting', !!awaitingOutcome);

    const hangupBtn = hud.querySelector('[data-hud-action="hangup"]');
    if (hangupBtn) hangupBtn.disabled = !!awaitingOutcome || !inCall;

    for (const b of hud.querySelectorAll('[data-outcome]')) {
      b.disabled = !awaitingOutcome;
    }
  }

  function makeDraggable(el, handle) {
    let dx = 0, dy = 0;
    handle.style.cursor = 'move';
    handle.addEventListener('pointerdown', (e) => {
      const r = el.getBoundingClientRect();
      dx = e.clientX - r.left;
      dy = e.clientY - r.top;
      const move = (ev) => {
        el.style.left = `${ev.clientX - dx}px`;
        el.style.top = `${ev.clientY - dy}px`;
        el.style.right = 'auto';
        el.style.bottom = 'auto';
      };
      const up = () => {
        document.removeEventListener('pointermove', move);
        document.removeEventListener('pointerup', up);
      };
      document.addEventListener('pointermove', move);
      document.addEventListener('pointerup', up);
    });
  }

  /* ================= boot ================= */

  connect();
  send('CONTENT_READY', { href: location.href });
  console.info('[GV Dialer] content script ready — run GVSel.probe() to verify selectors.');
})();
