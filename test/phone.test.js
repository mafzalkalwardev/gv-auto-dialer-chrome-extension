/* Run: node --test test/  (Node 18+) */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalize, buildQueue, checkCallingWindow } from '../lib/phone.js';

test('normalize accepts common US formats', () => {
  for (const input of [
    '6512631806', '(651) 263-1806', '651-263-1806',
    '16512631806', '+1 651 263 1806', ' 651.263.1806 ',
  ]) {
    const r = normalize(input);
    assert.equal(r.ok, true, `${input} should be valid`);
    assert.equal(r.e164, '+16512631806');
    assert.equal(r.national, '6512631806');
  }
});

test('normalize survives Excel mangling numbers into other types', () => {
  assert.equal(normalize(6512631806).e164, '+16512631806');
  assert.equal(normalize('6512631806.0').ok, false); // trailing .0 -> 11 digits, no leading 1
});

test('normalize rejects malformed numbers', () => {
  assert.equal(normalize('').ok, false);
  assert.equal(normalize(null).ok, false);
  assert.equal(normalize('12345').ok, false);
  assert.equal(normalize('0512631806').ok, false);  // NPA starts with 0
  assert.equal(normalize('5551231234').ok, false);  // 555 is unassignable
  assert.equal(normalize('6510631806').ok, false);  // NXX starts with 0
});

test('buildQueue validates, dedupes, and suppresses DNC', () => {
  const rows = [
    { 'Phone Number': '6512631806', 'Customer Name': 'Annette Dick' },
    { 'Phone Number': '(651) 263-1806', 'Customer Name': 'Annette Dick dup' },
    { 'Phone Number': '2026697823', 'Customer Name': 'Micheal Minnick' },
    { 'Phone Number': 'not-a-number', 'Customer Name': 'Broken' },
    { 'Phone Number': '4433355412', 'Customer Name': 'brunette blyther' },
  ];
  const { contacts, summary } = buildQueue(rows, { dncList: ['202-669-7823'] });

  assert.equal(summary.total, 5);
  assert.equal(summary.invalid, 1);
  assert.equal(summary.duplicate, 1);
  assert.equal(summary.suppressed, 1);
  assert.equal(summary.readyToDial, 2);
  assert.deepEqual(contacts.map((c) => c.number), ['6512631806', '4433355412']);
  assert.equal(contacts[0].pretty, '(651) 263-1806');
  assert.equal(contacts[0].status, 'ready');
});

test('buildQueue finds columns regardless of header casing or spacing', () => {
  const { contacts } = buildQueue([
    { phone: '6512631806', name: 'lower' },
    { 'PHONE NUMBER': '4433355412', 'Full Name': 'upper' },
    { 'phone_number': '2026697823', 'contact name': 'snake' },
  ]);
  assert.equal(contacts.length, 3);
  assert.deepEqual(contacts.map((c) => c.name), ['lower', 'upper', 'snake']);
});

test('checkCallingWindow blocks calls outside 8am-9pm local', () => {
  // 651 is Central (UTC-6, -5 in DST). January -> standard time.
  const threeAmCentral = new Date(Date.UTC(2026, 0, 15, 9, 0)); // 03:00 CST
  const twoPmCentral   = new Date(Date.UTC(2026, 0, 15, 20, 0)); // 14:00 CST

  assert.equal(checkCallingWindow('+16512631806', threeAmCentral).allowed, false);
  assert.equal(checkCallingWindow('+16512631806', twoPmCentral).allowed, true);
});

test('checkCallingWindow fails open on unknown area codes', () => {
  const r = checkCallingWindow('+16709998888');
  assert.equal(r.allowed, true);
  assert.match(r.reason, /unknown/);
});
