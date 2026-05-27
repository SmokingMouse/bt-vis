import { describe, expect, it } from 'vitest';
import { createInitialState, run, step } from '../engine';
import type { Message, Scenario, SimEvent } from '../types';

// 2-peer 场景: A 是 seeder, B 是空 leecher。
const twoPeerScenario: Scenario = {
  id: 'two-peer',
  torrent: { totalPieces: 4 },
  peers: [
    { id: 'A', initialPieces: [0, 1, 2, 3], uploadCapacity: 2, downloadCapacity: 2 },
    { id: 'B', initialPieces: [], uploadCapacity: 1, downloadCapacity: 2 },
  ],
  initialConnections: [['A', 'B']],
};

// 3-peer 场景: A seeder, B 空 leecher, C 有 piece 0。
const threePeerScenario: Scenario = {
  id: 'three-peer',
  torrent: { totalPieces: 4 },
  peers: [
    { id: 'A', initialPieces: [0, 1, 2, 3], uploadCapacity: 2, downloadCapacity: 2 },
    { id: 'B', initialPieces: [], uploadCapacity: 1, downloadCapacity: 2 },
    { id: 'C', initialPieces: [0], uploadCapacity: 1, downloadCapacity: 2 },
  ],
  initialConnections: [
    ['A', 'B'],
    ['A', 'C'],
    ['B', 'C'],
  ],
};

// 2-seeder 场景: 双方都全有(都是 seeder),用来测 not_interested。
const twoSeederScenario: Scenario = {
  id: 'two-seeder',
  torrent: { totalPieces: 2 },
  peers: [
    { id: 'A', initialPieces: [0, 1], uploadCapacity: 1, downloadCapacity: 1 },
    { id: 'B', initialPieces: [0, 1], uploadCapacity: 1, downloadCapacity: 1 },
  ],
  initialConnections: [['A', 'B']],
};

function messagesByTick(events: readonly SimEvent[], tick: number): SimEvent[] {
  return events.filter((e) => e.tick === tick && e.kind === 'message');
}

describe('handshake — stage progression (2-peer)', () => {
  it('tick 1: each direction sends handshake', () => {
    const r = step(createInitialState(twoPeerScenario, 42), twoPeerScenario);
    const msgs = messagesByTick(r.events, 1);
    const types = msgs
      .map((e) => (e.kind === 'message' ? e.message.type : ''))
      .sort();
    expect(types).toEqual(['handshake', 'handshake']);
    expect(r.state.connections['A->B'].state.handshakeSent).toBe(true);
    expect(r.state.connections['B->A'].state.handshakeSent).toBe(true);
  });

  it('tick 1: handshake_complete event fires (both sides done in same tick)', () => {
    const r = step(createInitialState(twoPeerScenario, 42), twoPeerScenario);
    const complete = r.events.filter((e) => e.kind === 'handshake_complete');
    expect(complete.length).toBe(1);
    expect(complete[0]).toMatchObject({ tick: 1, a: 'A', b: 'B' });
  });

  it('tick 2: each direction sends bitfield', () => {
    const r = run(createInitialState(twoPeerScenario, 42), twoPeerScenario, 2);
    const msgs = messagesByTick(r.events, 2);
    const bitfieldMsgs = msgs.filter((e) =>
      e.kind === 'message' && e.message.type === 'bitfield',
    );
    expect(bitfieldMsgs.length).toBe(2);
    expect(r.state.connections['A->B'].state.bitfieldSent).toBe(true);
    expect(r.state.connections['B->A'].state.bitfieldSent).toBe(true);
    // peerBitfield 应该已被对方"传"过来。
    expect(r.state.connections['A->B'].state.peerBitfield).toEqual([false, false, false, false]);
    expect(r.state.connections['B->A'].state.peerBitfield).toEqual([true, true, true, true]);
  });

  it('tick 3: A→B sends not_interested (A is seeder, B has nothing A wants); B→A sends interested', () => {
    const r = run(createInitialState(twoPeerScenario, 42), twoPeerScenario, 3);
    const msgs = messagesByTick(r.events, 3);
    const interestMsgs = msgs
      .map((e) => (e.kind === 'message' ? e.message : null))
      .filter((m): m is Message => m !== null)
      .filter((m) => m.type === 'interested' || m.type === 'not_interested');
    expect(interestMsgs.length).toBe(2);

    const aToB = interestMsgs.find((m) => m.from === 'A' && m.to === 'B');
    const bToA = interestMsgs.find((m) => m.from === 'B' && m.to === 'A');
    expect(aToB?.type).toBe('not_interested');
    expect(bToA?.type).toBe('interested');

    expect(r.state.connections['A->B'].state.amInterested).toBe(false);
    expect(r.state.connections['B->A'].state.amInterested).toBe(true);
    expect(r.state.connections['A->B'].state.interestExpressed).toBe(true);
    expect(r.state.connections['B->A'].state.interestExpressed).toBe(true);
  });

});

describe('handshake — 3-peer scenario', () => {
  it('all 6 directed connections complete handshake by tick 1', () => {
    const r = step(createInitialState(threePeerScenario, 42), threePeerScenario);
    for (const key of ['A->B', 'B->A', 'A->C', 'C->A', 'B->C', 'C->B']) {
      expect(r.state.connections[key].state.handshakeSent).toBe(true);
    }
    const complete = r.events.filter((e) => e.kind === 'handshake_complete');
    expect(complete.length).toBe(3);
  });

  it('by tick 3, all interest is expressed', () => {
    const r = run(createInitialState(threePeerScenario, 42), threePeerScenario, 3);
    for (const key of ['A->B', 'B->A', 'A->C', 'C->A', 'B->C', 'C->B']) {
      expect(r.state.connections[key].state.interestExpressed).toBe(true);
    }
  });

  it('C→A: not_interested (C has piece 0, A has 0,1,2,3 → C wants 1,2,3 → interested)', () => {
    const r = run(createInitialState(threePeerScenario, 42), threePeerScenario, 3);
    expect(r.state.connections['C->A'].state.amInterested).toBe(true);
  });

  it('A→C: not_interested (A is seeder, C has piece 0 only → A wants nothing)', () => {
    const r = run(createInitialState(threePeerScenario, 42), threePeerScenario, 3);
    expect(r.state.connections['A->C'].state.amInterested).toBe(false);
  });

  it('B→C: interested (B is empty, C has piece 0 → B wants it)', () => {
    const r = run(createInitialState(threePeerScenario, 42), threePeerScenario, 3);
    expect(r.state.connections['B->C'].state.amInterested).toBe(true);
  });

  it('C→B: not_interested (B is empty, C wants nothing from B)', () => {
    const r = run(createInitialState(threePeerScenario, 42), threePeerScenario, 3);
    expect(r.state.connections['C->B'].state.amInterested).toBe(false);
  });
});

describe('handshake — 2-seeder edge case', () => {
  it('both sides express not_interested (no one wants anything)', () => {
    const r = run(createInitialState(twoSeederScenario, 42), twoSeederScenario, 3);
    expect(r.state.connections['A->B'].state.amInterested).toBe(false);
    expect(r.state.connections['B->A'].state.amInterested).toBe(false);
  });
});

describe('handshake — determinism preserved', () => {
  it('same seed → identical state through handshake phase', () => {
    const r1 = run(createInitialState(threePeerScenario, 42), threePeerScenario, 5);
    const r2 = run(createInitialState(threePeerScenario, 42), threePeerScenario, 5);
    expect(r1.state).toEqual(r2.state);
    expect(r1.events).toEqual(r2.events);
  });

  it('handshake_complete fires exactly once per undirected pair', () => {
    const r = run(createInitialState(threePeerScenario, 42), threePeerScenario, 10);
    const complete = r.events.filter((e) => e.kind === 'handshake_complete');
    expect(complete.length).toBe(3);
    const pairs = complete.map((e) =>
      e.kind === 'handshake_complete' ? `${e.a}|${e.b}` : '',
    ).sort();
    expect(pairs).toEqual(['A|B', 'A|C', 'B|C']);
  });

  it('input state is not mutated through handshake phase', () => {
    const s = createInitialState(threePeerScenario, 42);
    const snapshot = JSON.parse(JSON.stringify(s));
    run(s, threePeerScenario, 10);
    expect(s).toEqual(snapshot);
  });
});

describe('peerBitfield — protocol fidelity', () => {
  it('peerBitfield is a deep copy, not a shared reference', () => {
    const r = run(createInitialState(twoPeerScenario, 42), twoPeerScenario, 5);
    const aToB = r.state.connections['A->B'];
    // 改一下 peer B 的 bitfield, conn.peerBitfield 不应跟着变。
    r.state.peers.B.bitfield[0] = true;
    expect(aToB.state.peerBitfield![0]).toBe(false);
  });
});
