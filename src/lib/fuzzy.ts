function damerauLevenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array<number>(n + 1).fill(0));

  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + cost,
      );
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        dp[i][j] = Math.min(dp[i][j], dp[i - 2][j - 2] + cost);
      }
    }
  }
  return dp[m][n];
}

export function resolveFuzzyTarget(
  rawQuery: string,
  candidates: string[],
  aliases: Record<string, string> = {},
): string | null {
  const q = rawQuery.trim().toLowerCase();
  if (!q) return null;

  if (candidates.includes(q)) return q;
  if (Object.hasOwn(aliases, q)) return aliases[q];

  // Unambiguous prefix match for >= 3 characters (e.g., "proj" -> "projects", "stat" -> "stats")
  if (q.length >= 3) {
    const candidatePrefixes = candidates.filter((c) => c.startsWith(q));
    if (candidatePrefixes.length === 1) return candidatePrefixes[0];

    const aliasPrefixes = Object.keys(aliases).filter((a) => a.startsWith(q));
    const resolvedTargets = [...new Set(aliasPrefixes.map((a) => aliases[a]))];
    if (resolvedTargets.length === 1 && candidatePrefixes.length === 0) {
      return resolvedTargets[0];
    }
  }

  // Fuzzy edit-distance match across candidates and aliases
  const maxDist = q.length <= 3 ? 1 : q.length <= 6 ? 2 : 3;
  let bestTarget: string | null = null;
  let bestScore = Infinity;

  const pool: Array<[string, string]> = [
    ...candidates.map((c): [string, string] => [c, c]),
    ...Object.entries(aliases),
  ];

  for (const [term, target] of pool) {
    const dist = damerauLevenshtein(q, term);
    if (dist <= maxDist && dist < bestScore) {
      bestScore = dist;
      bestTarget = target;
    }
  }

  return bestTarget;
}
