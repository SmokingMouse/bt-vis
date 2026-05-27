import { describe, expect, it } from 'vitest';
import { isComplete, selectRarestPiece } from '../protocol/piece-selection';

describe('selectRarestPiece', () => {
  it('returns null when nothing is missing', () => {
    expect(selectRarestPiece([true, true, true, true], [[true, true, true, true]])).toBeNull();
  });

  it('returns null when no peer holds anything I am missing', () => {
    expect(
      selectRarestPiece(
        [false, false, false, false],
        [[false, false, false, false]],
      ),
    ).toBeNull();
  });

  it('picks the rarest among candidates', () => {
    // 我缺 0,1,2,3。peer A: [1,1,1,0], peer B: [0,1,1,0], peer C: [0,0,1,1]
    // counts:                            1   2   3   1 → 4 is rarest (count=1), tie with 0
    // tie-break: PieceId 升序 → 0
    const result = selectRarestPiece(
      [false, false, false, false],
      [
        [true, true, true, false],
        [false, true, true, false],
        [false, false, true, true],
      ],
    );
    expect(result).toBe(0);
  });

  it('picks unique rarest piece when no tie', () => {
    // peer A: [1,1,1], peer B: [1,1,0], peer C: [1,0,0]
    // counts: 3 2 1 → rarest = piece 2
    const result = selectRarestPiece(
      [false, false, false],
      [
        [true, true, true],
        [true, true, false],
        [true, false, false],
      ],
    );
    expect(result).toBe(2);
  });

  it('skips pieces I already have', () => {
    // 我有 piece 0,缺 1,2。peer 持有全部。
    // 即使 piece 0 是最稀有也不选(我已经有)
    const result = selectRarestPiece(
      [true, false, false],
      [[true, true, true]],
    );
    // counts: 1 1 1, 跳过 0, tie-break 选 1
    expect(result).toBe(1);
  });

  it('tie-break is deterministic (lowest PieceId)', () => {
    // 多次调用同输入,结果一致
    const a = selectRarestPiece(
      [false, false, false, false],
      [[true, true, true, true]],
    );
    const b = selectRarestPiece(
      [false, false, false, false],
      [[true, true, true, true]],
    );
    expect(a).toBe(b);
    expect(a).toBe(0);
  });
});

describe('isComplete', () => {
  it('returns true when all true', () => {
    expect(isComplete([true, true, true])).toBe(true);
  });
  it('returns false when any false', () => {
    expect(isComplete([true, false, true])).toBe(false);
    expect(isComplete([false, false, false])).toBe(false);
  });
  it('returns true for empty (vacuously)', () => {
    expect(isComplete([])).toBe(true);
  });
});
