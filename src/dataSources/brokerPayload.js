// brokerPayload.js
//
// Two tiny readers for "what did the broker actually send us?", extracted
// here so they can be unit-tested without a live connection.
//
// WHY THIS FILE EXISTS (2026-09-18). Three real orders - Divergence/US500
// on 17/09 14:00 UTC, Silver Bullet/US100 on 17/09 15:15 UTC, and
// Divergence/US500 on 18/09 11:00 UTC - were submitted, got no
// confirmation, and a ProtoOAReconcileReq then proved no order and no
// position had ever been created at the broker. So the orders were
// REFUSED, not lost in transit. Yet nothing in this codebase could say
// why, for two separate reasons, both fixed by the callers of this file:
//
//   1. ProtoOAOrderErrorEvent - the message cTrader pushes when it refuses
//      an order before ever creating it, and the only one carrying the
//      reason - was subscribed nowhere. A refusal was indistinguishable
//      from silence.
//   2. The one log line that did exist for the submission response used
//      JSON.stringify(), which is exactly the trap already documented at
//      length in cTraderDataSource.start(): this library hands back
//      objects whose real content sits behind PROTOTYPE GETTERS backed by
//      private class fields, and JSON.stringify() sees none of that - it
//      prints `{}`. Every "rawRes={}" ever logged is therefore evidence of
//      nothing at all. It never established that the response was empty,
//      only that it could not be read this way.
//
// describeBrokerPayload() is the fix for (2) and the diagnostic for (1).

import { inspect } from 'node:util';

// Walks the whole prototype chain collecting accessor (getter) properties
// and evaluating them. util.inspect's own `getters: true` option is not
// enough on its own: it still only reports a value's OWN properties, and
// this library's getters live on the prototype, which is precisely why the
// content stayed invisible.
function readAccessors(payload) {
  const out = {};
  const seen = new Set();
  let proto = payload;
  while (proto && proto !== Object.prototype) {
    for (const [name, descriptor] of Object.entries(Object.getOwnPropertyDescriptors(proto))) {
      if (typeof descriptor.get !== 'function' || seen.has(name)) continue;
      seen.add(name);
      try {
        out[name] = payload[name];
      } catch (err) {
        // A getter that throws must not take the whole log line down with
        // it - the point of this function is to survive an unknown shape.
        out[name] = `<getter threw: ${err.message}>`;
      }
    }
    proto = Object.getPrototypeOf(proto);
  }
  return out;
}

// Own data properties only. Deliberately NOT `{ ...payload }`: object spread
// EVALUATES own enumerable getters, so spreading would re-run - and this time
// not catch - a getter readAccessors() already safely handled. Found by the
// test in test/brokerPayload.test.js, which is exactly the hostile shape this
// function exists to survive.
function readOwnData(payload) {
  const out = {};
  for (const [name, descriptor] of Object.entries(Object.getOwnPropertyDescriptors(payload))) {
    if (typeof descriptor.get === 'function') continue; // readAccessors' job
    out[name] = descriptor.value;
  }
  return out;
}

/**
 * A log-safe, actually-readable rendering of anything the broker hands back
 * - a decoded response, an event wrapper, a plain object. Never throws.
 */
export function describeBrokerPayload(payload) {
  if (payload === null || payload === undefined || typeof payload !== 'object') return String(payload);
  let merged;
  try {
    const accessors = readAccessors(payload);
    merged = Object.keys(accessors).length > 0 ? { ...readOwnData(payload), ...accessors } : payload;
  } catch {
    merged = payload;
  }
  try {
    return inspect(merged, { depth: 4, breakLength: Infinity, maxStringLength: 400 });
  } catch (err) {
    return `<uninspectable payload: ${err.message}>`;
  }
}

/**
 * Pulls a broker refusal out of a payload, wherever it turns out to sit:
 * on the object itself (a ProtoOAOrderErrorEvent descriptor, a
 * ProtoOAErrorRes returned in place of a ProtoOANewOrderRes), or behind the
 * `descriptor` getter of an event wrapper.
 *
 * Returns null when there is no error in there - deliberately keyed on
 * errorCode/description, the two fields ProtoOAOrderErrorEvent and
 * ProtoOAErrorRes share and a successful order response carries neither of.
 */
export function extractBrokerError(payload) {
  if (payload === null || payload === undefined || typeof payload !== 'object') return null;
  let candidates;
  try {
    candidates = [payload, payload.descriptor, payload.errorRes];
  } catch {
    candidates = [payload];
  }
  for (const candidate of candidates) {
    if (!candidate || typeof candidate !== 'object') continue;
    const errorCode = candidate.errorCode ?? null;
    const description = candidate.description ?? null;
    if (errorCode == null && description == null) continue;
    return {
      errorCode: errorCode == null ? null : String(errorCode),
      description: description == null ? null : String(description),
      // Present on ProtoOAOrderErrorEvent, absent on a bare ProtoOAErrorRes.
      orderId: candidate.orderId == null ? null : String(candidate.orderId),
      positionId: candidate.positionId == null ? null : String(candidate.positionId),
    };
  }
  return null;
}
