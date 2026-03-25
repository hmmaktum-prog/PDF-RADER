import { getFourUpBookletChunks } from '../fourUpBooklet';

describe('getFourUpBookletChunks', () => {
  it('returns correct chunking for 8 pages', () => {
    const chunks = getFourUpBookletChunks(8);
    expect(chunks).toEqual([
      [8, 1, 6, 3],
      [2, 7, 4, 5],
    ]);
  });

  it('pads to 8 multiples for non-multiple-of-8 page counts', () => {
    const chunks = getFourUpBookletChunks(10);
    expect(chunks.length).toBe(4); // 16 pages padded => 4 sheets
    expect(chunks[0]).toEqual([16, 1, 12, 5]);
  });

  it('returns empty for zero or negative page count', () => {
    expect(getFourUpBookletChunks(0)).toEqual([]);
    expect(getFourUpBookletChunks(-5)).toEqual([]);
  });
});
