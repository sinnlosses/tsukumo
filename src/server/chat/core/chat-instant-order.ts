// オフセットが違っても正しく比べる、時刻文字列の前後。

/** `at` が `boundary` より後か。 */
export function isAfterAt(at: string, boundary: string): boolean {
  return Temporal.Instant.compare(Temporal.Instant.from(at), Temporal.Instant.from(boundary)) > 0
}

/** `at` が `boundary` より前か。 */
export function isBeforeAt(at: string, boundary: string): boolean {
  return Temporal.Instant.compare(Temporal.Instant.from(at), Temporal.Instant.from(boundary)) < 0
}
