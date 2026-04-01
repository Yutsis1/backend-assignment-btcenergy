export const DAY_IN_MS = 86_400_000n

export function resolveBlockQueryTimestamps(fromTimestampMs: bigint, toTimestampMs: bigint): bigint[] {
  if (fromTimestampMs >= toTimestampMs) {
    return []
  }

  const queryTimestamps: bigint[] = []
  let queryTimestamp = fromTimestampMs + DAY_IN_MS

  while (queryTimestamp < toTimestampMs) {
    queryTimestamps.push(queryTimestamp)
    queryTimestamp += DAY_IN_MS
  }

  if (queryTimestamps.length === 0 || queryTimestamps[queryTimestamps.length - 1] !== toTimestampMs) {
    queryTimestamps.push(toTimestampMs)
  }

  return queryTimestamps
}
