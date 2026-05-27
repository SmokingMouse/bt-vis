import { describe, expect, it } from 'vitest';
import {
  createInitialState,
  nextInt,
  nextRandom,
  run,
  step,
} from '../engine';
import type { Scenario, SimState } from '../types';

const scenario: Scenario = {
  id: 'test-basic',
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

describe('nextRandom (PRNG)', () => {
  it('returns a value in [0, 1)', () => {
    let s = 42;
    for (let i = 0; i < 1000; i++) {
      const r = nextRandom(s);
      expect(r.value).toBeGreaterThanOrEqual(0);
      expect(r.value).toBeLessThan(1);
      s = r.next;
    }
  });

  it('is deterministic given same input state', () => {
    expect(nextRandom(42)).toEqual(nextRandom(42));
    expect(nextRandom(0)).toEqual(nextRandom(0));
  });

  it('different seeds produce different sequences', () => {
    expect(nextRandom(1).value).not.toEqual(nextRandom(2).value);
  });
});

describe('nextInt', () => {
  it('returns integer in [0, n)', () => {
    let s = 123;
    for (let i = 0; i < 500; i++) {
      const r = nextInt(s, 10);
      expect(Number.isInteger(r.value)).toBe(true);
      expect(r.value).toBeGreaterThanOrEqual(0);
      expect(r.value).toBeLessThan(10);
      s = r.next;
    }
  });
});

describe('createInitialState', () => {
  it('initializes peers with correct bitfields', () => {
    const s = createInitialState(scenario, 42);
    expect(s.tick).toBe(0);
    expect(s.peers.A.bitfield).toEqual([true, true, true, true]);
    expect(s.peers.B.bitfield).toEqual([false, false, false, false]);
    expect(s.peers.C.bitfield).toEqual([true, false, false, false]);
  });

  it('initializes connections in both directions, choked + not interested + no protocol progress', () => {
    const s = createInitialState(scenario, 42);
    expect(s.connections['A->B']).toBeDefined();
    expect(s.connections['B->A']).toBeDefined();
    const expected = {
      amChoking: true,
      amInterested: false,
      handshakeSent: false,
      bitfieldSent: false,
      peerBitfield: null,
      interestExpressed: false,
      piecesReceived: 0,
    };
    expect(s.connections['A->B'].state).toEqual(expected);
    expect(s.connections['B->A'].state).toEqual(expected);
    expect(s.connections['A->B'].pendingRequests).toEqual([]);
  });

  it('rngState is seeded from seed', () => {
    expect(createInitialState(scenario, 42).rngState).toBe(42);
    expect(createInitialState(scenario, 999).rngState).toBe(999);
  });
});

describe('step — determinism (key invariant)', () => {
  it('same seed + same scenario → identical state at every tick', () => {
    const a = createInitialState(scenario, 42);
    const b = createInitialState(scenario, 42);
    expect(a).toEqual(b);

    const ra = run(a, scenario, 100);
    const rb = run(b, scenario, 100);
    expect(ra.state).toEqual(rb.state);
    expect(ra.events).toEqual(rb.events);
  });

  it('different seeds → different rngState progression', () => {
    const a = run(createInitialState(scenario, 1), scenario, 10);
    const b = run(createInitialState(scenario, 2), scenario, 10);
    expect(a.state.rngState).not.toBe(b.state.rngState);
  });
});

describe('step — purity (input must not mutate)', () => {
  it('does not mutate input state', () => {
    const s = createInitialState(scenario, 42);
    const snapshot = JSON.parse(JSON.stringify(s)) as SimState;
    step(s, scenario);
    expect(s).toEqual(snapshot);
  });

  it('does not mutate input across many ticks', () => {
    const s = createInitialState(scenario, 42);
    const snapshot = JSON.parse(JSON.stringify(s)) as SimState;
    run(s, scenario, 50);
    expect(s).toEqual(snapshot);
  });
});

describe('step — tick + event semantics', () => {
  it('advances tick by 1', () => {
    const s = createInitialState(scenario, 42);
    const r = step(s, scenario);
    expect(r.state.tick).toBe(1);
    expect(step(r.state, scenario).state.tick).toBe(2);
  });

  it('emits peer_joined for every peer at tick 1', () => {
    const r = step(createInitialState(scenario, 42), scenario);
    const joined = r.events.filter((e) => e.kind === 'peer_joined');
    expect(new Set(joined.map((e) => (e as { peerId: string }).peerId))).toEqual(
      new Set(['A', 'B', 'C']),
    );
    expect(joined.every((e) => e.tick === 1)).toBe(true);
  });

  it('emits connection_opened once per undirected pair at tick 1', () => {
    const r = step(createInitialState(scenario, 42), scenario);
    const opened = r.events.filter((e) => e.kind === 'connection_opened');
    expect(opened.length).toBe(3);
    expect(opened.every((e) => e.tick === 1)).toBe(true);
  });

  it('does not re-emit init events after tick 1', () => {
    const r = run(createInitialState(scenario, 42), scenario, 10);
    const initEvents = r.events.filter(
      (e) => e.kind === 'peer_joined' || e.kind === 'connection_opened',
    );
    expect(initEvents.every((e) => e.tick === 1)).toBe(true);
  });

  it('event ticks are monotonically non-decreasing', () => {
    const r = run(createInitialState(scenario, 42), scenario, 50);
    for (let i = 1; i < r.events.length; i++) {
      expect(r.events[i].tick).toBeGreaterThanOrEqual(r.events[i - 1].tick);
    }
  });
});

describe('SimState — serializable', () => {
  it('round-trips through JSON without loss (structured-clone friendly)', () => {
    const s = createInitialState(scenario, 42);
    const r = run(s, scenario, 20);
    const json = JSON.stringify(r.state);
    const parsed = JSON.parse(json);
    expect(parsed).toEqual(r.state);
  });
});
