/* ------------------------------------------------------------------
 * selectors.js
 *
 * EVERY Google Voice DOM assumption lives in this file and nowhere else.
 * Google ships obfuscated, frequently-rotated class names (.VfPpkd-LgbsSe
 * and friends), so nothing here selects on a class. We anchor on things
 * Google keeps stable for accessibility: aria-label, role, placeholder,
 * and visible text.
 *
 * When Google redesigns, this is the ONLY file you should have to touch.
 * Run GVSel.probe() in the DevTools console on voice.google.com to see
 * which candidates currently resolve.
 * ------------------------------------------------------------------ */

const GVSel = (() => {
  /* Each entry is a list of candidate strategies, tried in order.
     A strategy is either a CSS selector string, or a function
     returning an Element | null. */

  const CANDIDATES = {
    // The "Enter a name or number" field on the Calls tab.
    dialInput: [
      'input[placeholder*="Enter a name or number" i]',
      'input[aria-label*="Enter a name or number" i]',
      'input[aria-label*="name or number" i]',
      'input[type="tel"]',
      () => byPlaceholderFuzzy('input', ['name or number', 'phone number']),
    ],

    // The green call button next to the dial input.
    callButton: [
      'button[aria-label*="Call" i]:not([aria-label*="End" i]):not([aria-label*="Video" i])',
      'div[role="button"][aria-label*="Call" i]:not([aria-label*="End" i])',
      () => byAriaFuzzy(['place call', 'start call', 'call ']),
    ],

    // Shown only while a call is up.
    hangupButton: [
      'button[aria-label*="End call" i]',
      'button[aria-label*="Hang up" i]',
      'div[role="button"][aria-label*="End call" i]',
      () => byAriaFuzzy(['end call', 'hang up']),
    ],

    // The in-call elapsed timer, e.g. "0:08". Used for duration + as a
    // secondary "we are definitely connected" signal.
    callTimer: [
      () => byTextPattern(/^\s*\d{1,2}:\d{2}(:\d{2})?\s*$/),
    ],

    // Container that appears during an active call. Presence == in call.
    callSurface: [
      'div[role="dialog"][aria-label*="call" i]',
      () => GVSel.find('hangupButton')?.closest('div[role="dialog"], div[jsname]') || null,
    ],
  };

  /* ---------------- helpers ---------------- */

  function byPlaceholderFuzzy(tag, needles) {
    for (const el of document.querySelectorAll(tag)) {
      const p = (el.placeholder || '').toLowerCase();
      if (needles.some((n) => p.includes(n))) return el;
    }
    return null;
  }

  function byAriaFuzzy(needles) {
    const nodes = document.querySelectorAll('button,[role="button"]');
    for (const el of nodes) {
      const a = (el.getAttribute('aria-label') || '').toLowerCase();
      if (needles.some((n) => a.includes(n))) return el;
    }
    return null;
  }

  function byTextPattern(re) {
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    let n;
    while ((n = walker.nextNode())) {
      if (re.test(n.nodeValue) && n.parentElement?.offsetParent !== null) {
        return n.parentElement;
      }
    }
    return null;
  }

  function isVisible(el) {
    if (!el) return false;
    if (el.offsetParent === null && getComputedStyle(el).position !== 'fixed') return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  }

  /* ---------------- public API ---------------- */

  function find(key, { requireVisible = true } = {}) {
    const list = CANDIDATES[key];
    if (!list) throw new Error(`Unknown selector key: ${key}`);
    for (const strategy of list) {
      let el = null;
      try {
        el = typeof strategy === 'function'
          ? strategy()
          : document.querySelector(strategy);
      } catch (_) { /* bad selector, try next */ }
      if (el && (!requireVisible || isVisible(el))) return el;
    }
    return null;
  }

  /** Wait up to `timeout` ms for a selector to resolve. */
  function waitFor(key, timeout = 8000, interval = 150) {
    return new Promise((resolve, reject) => {
      const started = Date.now();
      (function tick() {
        const el = find(key);
        if (el) return resolve(el);
        if (Date.now() - started > timeout) {
          return reject(new Error(`Timed out waiting for "${key}"`));
        }
        setTimeout(tick, interval);
      })();
    });
  }

  /**
   * Print which selectors currently resolve. Run this in the console on
   * voice.google.com whenever something stops working — it tells you
   * exactly which key to repair instead of guessing.
   */
  function probe() {
    const rows = Object.keys(CANDIDATES).map((key) => {
      const el = find(key);
      return {
        key,
        found: !!el,
        tag: el ? el.tagName.toLowerCase() : '—',
        aria: el ? (el.getAttribute('aria-label') || '').slice(0, 40) : '—',
        text: el ? (el.innerText || '').trim().slice(0, 30) : '—',
      };
    });
    console.table(rows);
    const missing = rows.filter((r) => !r.found).map((r) => r.key);
    if (missing.length) {
      console.warn('[GV Dialer] Unresolved selectors:', missing.join(', '));
      console.info('Open the element in DevTools, copy a stable attribute ' +
                   '(aria-label / role / placeholder), and add it to CANDIDATES in selectors.js.');
    } else {
      console.info('[GV Dialer] All selectors resolved.');
    }
    return rows;
  }

  return { find, waitFor, probe, isVisible, CANDIDATES };
})();

// Expose for console debugging.
window.GVSel = GVSel;
