export interface Spread {
  l: number;
  r: number;
}

export function getSpreads(startIdx: number, count: number): Spread[] {
  const spreads: Spread[] = [];
  const sheets = Math.ceil(count / 4);

  for (let s = 0; s < sheets; s++) {
    // Front Side (outer pair)
    spreads.push({
      l: startIdx + count - 1 - 2 * s,
      r: startIdx + 2 * s,
    });

    // Back Side (inner pair)
    spreads.push({
      l: startIdx + 2 * s + 1,
      r: startIdx + count - 1 - 2 * s - 1,
    });
  }

  return spreads;
}

export function getFourUpBookletChunks(numPages: number): number[][] {
  if (numPages <= 0) return [];

  // ধাপ ১: ৮-এর গুণিতক পর্যন্ত প্যাড
  let padded = numPages;
  while (padded % 8 !== 0) padded++;

  // ধাপ ২: স্প্রেড তৈরি
  const allSpreads = getSpreads(0, padded);

  // ধাপ ৩: স্প্রেডকে দুই ভাগে ভাগ
  const halfCount = allSpreads.length / 2;
  const spreadsA = allSpreads.slice(0, halfCount);
  const spreadsB = allSpreads.slice(halfCount);

  // ধাপ ৪: ৪-পেজ গ্রিড/চাঙ্ক
  const chunks: number[][] = [];

  for (let i = 0; i < spreadsA.length; i++) {
    chunks.push([
      spreadsA[i].l + 1,
      spreadsA[i].r + 1,
      spreadsB[i].l + 1,
      spreadsB[i].r + 1,
    ]);
  }

  return chunks;
}
