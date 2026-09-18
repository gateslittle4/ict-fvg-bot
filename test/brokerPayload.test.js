import test from 'node:test';
import assert from 'node:assert/strict';
import { describeBrokerPayload, extractBrokerError } from '../src/dataSources/brokerPayload.js';

// The shape that caused the whole 2026-09-18 misdiagnosis: this library
// hands back objects whose real content lives behind PROTOTYPE getters
// backed by private class fields. JSON.stringify() prints `{}` for these,
// which is why "rawRes={}" was logged for every order ever submitted and
// read - wrongly - as "the broker returned nothing".
class WrapperLikeTheLibrarys {
  #descriptor;
  constructor(descriptor) {
    this.#descriptor = descriptor;
  }
  get descriptor() {
    return this.#descriptor;
  }
}

test('describeBrokerPayload: reads content JSON.stringify cannot see (the actual rawRes={} trap)', () => {
  const wrapper = new WrapperLikeTheLibrarys({ errorCode: 'TRADING_BAD_VOLUME', description: 'volume is invalid' });

  assert.equal(JSON.stringify(wrapper), '{}', 'guard: this is exactly what the old log line was printing');

  const described = describeBrokerPayload(wrapper);
  assert.match(described, /TRADING_BAD_VOLUME/);
  assert.match(described, /volume is invalid/);
});

test('describeBrokerPayload: a getter that throws does not take the log line down', () => {
  const hostile = {
    get boom() {
      throw new Error('nope');
    },
    fine: 1,
  };
  const described = describeBrokerPayload(hostile);
  assert.match(described, /getter threw: nope/);
  assert.match(described, /fine/);
});

test('describeBrokerPayload: primitives and nullish values render without throwing', () => {
  assert.equal(describeBrokerPayload(null), 'null');
  assert.equal(describeBrokerPayload(undefined), 'undefined');
  assert.equal(describeBrokerPayload(42), '42');
});

test('extractBrokerError: reads a ProtoOAOrderErrorEvent descriptor', () => {
  const error = extractBrokerError({
    ctidTraderAccountId: 48587457,
    errorCode: 'TRADING_BAD_STOPS',
    description: 'stop loss is too close to the market price',
    orderId: 50415794,
  });
  assert.deepEqual(error, {
    errorCode: 'TRADING_BAD_STOPS',
    description: 'stop loss is too close to the market price',
    orderId: '50415794',
    positionId: null,
  });
});

test('extractBrokerError: reads a refusal hidden behind an event wrapper getter', () => {
  const wrapper = new WrapperLikeTheLibrarys({ errorCode: 'MARKET_CLOSED', description: 'market is closed' });
  const error = extractBrokerError(wrapper);
  assert.equal(error?.errorCode, 'MARKET_CLOSED');
  assert.equal(error?.description, 'market is closed');
});

test('extractBrokerError: a normal order response is not mistaken for a refusal', () => {
  assert.equal(extractBrokerError({ order: { orderId: 50415794 } }), null);
  assert.equal(extractBrokerError({}), null);
  assert.equal(extractBrokerError(null), null);
});

test('extractBrokerError: an errorCode with no description still counts as a refusal', () => {
  // The broker is not guaranteed to send both - dropping a coded refusal
  // because it came without prose would put us right back in the dark.
  const error = extractBrokerError({ errorCode: 'NOT_ENOUGH_MONEY' });
  assert.equal(error?.errorCode, 'NOT_ENOUGH_MONEY');
  assert.equal(error?.description, null);
});
