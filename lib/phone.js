/* ------------------------------------------------------------------
 * phone.js — normalization, validation, dedupe, and calling guardrails.
 * Pure functions only: no DOM, no chrome.* APIs. Unit-testable in Node.
 * ------------------------------------------------------------------ */

/** NANP area codes that are never assignable to a subscriber. */
const INVALID_NPA = new Set(['000', '111', '911', '555']);

/**
 * Normalize free-form input to E.164 for the North American plan.
 * Returns { ok, e164, national, reason }.
 */
export function normalize(raw) {
  if (raw === null || raw === undefined) {
    return { ok: false, reason: 'empty' };
  }
  // Excel loves turning phone numbers into floats: 6512631806 -> 6512631806
  const digits = String(raw).replace(/[^\d]/g, '');

  if (!digits) return { ok: false, reason: 'empty' };

  let national;
  if (digits.length === 11 && digits.startsWith('1')) national = digits.slice(1);
  else if (digits.length === 10) national = digits;
  else return { ok: false, reason: `expected 10 or 11 digits, got ${digits.length}` };

  const npa = national.slice(0, 3);
  const nxx = national.slice(3, 6);

  if (npa[0] === '0' || npa[0] === '1') return { ok: false, reason: 'invalid area code' };
  if (nxx[0] === '0' || nxx[0] === '1') return { ok: false, reason: 'invalid exchange code' };
  if (INVALID_NPA.has(npa)) return { ok: false, reason: `unassignable area code ${npa}` };

  return {
    ok: true,
    e164: `+1${national}`,
    national,
    pretty: `(${npa}) ${nxx}-${national.slice(6)}`,
  };
}

/**
 * Turn parsed rows into a dial queue.
 * @param rows  array of objects from the CSV/XLSX parse
 * @param opts.dncList  array of raw numbers to exclude
 * @returns { contacts, summary }
 */
export function buildQueue(rows, opts = {}) {
  const dnc = new Set(
    (opts.dncList || [])
      .map((n) => normalize(n))
      .filter((r) => r.ok)
      .map((r) => r.e164)
  );

  const seen = new Set();
  const contacts = [];
  let invalid = 0;
  let duplicate = 0;
  let suppressed = 0;

  rows.forEach((row, i) => {
    const rawNumber = pick(row, ['phone number', 'phone', 'number', 'mobile', 'cell', 'phone_number']);
    const name = pick(row, ['customer name', 'name', 'contact', 'full name', 'customer', 'contact name']) || '';

    const norm = normalize(rawNumber);
    if (!norm.ok) { invalid++; return; }
    if (dnc.has(norm.e164)) { suppressed++; return; }
    if (seen.has(norm.e164)) { duplicate++; return; }

    seen.add(norm.e164);
    contacts.push({
      id: `c${contacts.length + 1}`,
      sourceRow: i + 2,          // +2 = 1-indexed, plus header row
      name: String(name).trim(),
      number: norm.national,      // what we type into the dialpad
      e164: norm.e164,
      pretty: norm.pretty,
      status: 'ready',            // ready | dialing | completed | failed | skipped
      result: null,               // Answered | Voicemail | Busy | ...
      durationSeconds: null,
      startedAt: null,
      endedAt: null,
    });
  });

  return {
    contacts,
    summary: {
      total: rows.length,
      valid: contacts.length,
      invalid,
      duplicate,
      suppressed,
      readyToDial: contacts.length,
    },
  };
}

/** Case- and space-insensitive column lookup. */
function pick(row, keys) {
  const map = {};
  for (const k of Object.keys(row)) {
    map[k.toLowerCase().replace(/[\s_]+/g, ' ').trim()] = row[k];
  }
  for (const k of keys) {
    const v = map[k];
    if (v !== undefined && v !== null && String(v).trim() !== '') return v;
  }
  return undefined;
}

/* ---------------- calling guardrails ---------------- */

/**
 * US federal telemarketing rules restrict calls to 8am–9pm in the
 * CALLED party's local time. This is a coarse NPA→timezone map; it is a
 * safety net, not legal advice, and several NPAs straddle boundaries.
 */
const NPA_TZ_OFFSET = { // hours from UTC, standard time
  // Pacific
  206: -8, 209: -8, 213: -8, 253: -8, 310: -8, 323: -8, 360: -8, 408: -8,
  415: -8, 425: -8, 503: -8, 509: -8, 510: -8, 530: -8, 541: -8, 559: -8,
  619: -8, 626: -8, 650: -8, 661: -8, 707: -8, 714: -8, 760: -8, 805: -8,
  818: -8, 831: -8, 858: -8, 909: -8, 916: -8, 925: -8, 949: -8, 951: -8,
  // Mountain
  303: -7, 385: -7, 435: -7, 480: -7, 505: -7, 520: -7, 602: -7, 623: -7,
  719: -7, 720: -7, 801: -7, 928: -7, 970: -7,
  // Central
  205: -6, 210: -6, 214: -6, 217: -6, 224: -6, 281: -6, 309: -6, 312: -6,
  314: -6, 316: -6, 318: -6, 337: -6, 361: -6, 402: -6, 405: -6, 409: -6,
  432: -6, 469: -6, 501: -6, 504: -6, 512: -6, 512: -6, 601: -6, 605: -6,
  612: -6, 615: -6, 630: -6, 636: -6, 651: -6, 682: -6, 708: -6, 713: -6,
  763: -6, 773: -6, 785: -6, 806: -6, 815: -6, 816: -6, 830: -6, 832: -6,
  847: -6, 903: -6, 913: -6, 918: -6, 936: -6, 940: -6, 952: -6, 972: -6,
  // Eastern
  201: -5, 202: -5, 203: -5, 207: -5, 212: -5, 215: -5, 216: -5, 240: -5,
  267: -5, 301: -5, 302: -5, 305: -5, 313: -5, 315: -5, 321: -5, 330: -5,
  339: -5, 347: -5, 352: -5, 386: -5, 401: -5, 404: -5, 407: -5, 410: -5,
  412: -5, 413: -5, 419: -5, 423: -5, 434: -5, 443: -5, 470: -5, 478: -5,
  484: -5, 502: -5, 508: -5, 513: -5, 516: -5, 517: -5, 518: -5, 540: -5,
  551: -5, 561: -5, 570: -5, 571: -5, 585: -5, 586: -5, 603: -5, 607: -5,
  609: -5, 610: -5, 614: -5, 616: -5, 617: -5, 631: -5, 646: -5, 678: -5,
  703: -5, 704: -5, 706: -5, 716: -5, 717: -5, 718: -5, 724: -5, 727: -5,
  732: -5, 734: -5, 740: -5, 754: -5, 757: -5, 762: -5, 770: -5, 772: -5,
  774: -5, 781: -5, 786: -5, 803: -5, 804: -5, 810: -5, 813: -5, 814: -5,
  828: -5, 843: -5, 845: -5, 850: -5, 856: -5, 857: -5, 859: -5, 860: -5,
  862: -5, 863: -5, 864: -5, 865: -5, 878: -5, 901: -5, 904: -5, 908: -5,
  910: -5, 912: -5, 914: -5, 917: -5, 919: -5, 937: -5, 941: -5, 947: -5,
  954: -5, 959: -5, 973: -5, 978: -5, 980: -5, 984: -5,
};

/**
 * @returns { allowed, localHour, reason }
 */
export function checkCallingWindow(e164, now = new Date(), window = { start: 8, end: 21 }) {
  const npa = Number(e164.replace('+1', '').slice(0, 3));
  const offset = NPA_TZ_OFFSET[npa];
  if (offset === undefined) {
    return { allowed: true, localHour: null, reason: 'timezone unknown for this area code' };
  }
  // Approximate DST: mid-March through early November.
  const m = now.getUTCMonth();
  const dst = m > 2 && m < 10;
  const localHour = (now.getUTCHours() + offset + (dst ? 1 : 0) + 24) % 24;
  const allowed = localHour >= window.start && localHour < window.end;
  return {
    allowed,
    localHour,
    reason: allowed ? null : `local time ${localHour}:00 is outside ${window.start}:00–${window.end}:00`,
  };
}
