// 入力を欄ごとに写して記録の行を作る関数が、入力の欄を落としていないことを確かめる。

import { expect } from "vitest"

/**
 * `entry` の鍵（配列の要素・入れ子の object を含む）が `record` に全部あることを確かめる。
 * `ignored` は意図して写さない鍵のパス（`models.0.costUsd` のように `.` で繋ぐ）。
 */
export function expectEveryFieldKept(
  entry: unknown,
  record: unknown,
  ignored: readonly string[] = [],
): void {
  const kept = new Set(keyPaths(record))
  const missing = keyPaths(entry).filter((path) => !ignored.includes(path) && !kept.has(path))
  expect(missing).toEqual([])
}

function keyPaths(value: unknown, prefix = ""): readonly string[] {
  if (typeof value !== "object" || value === null) {
    return []
  }
  return Object.entries(value).flatMap(([key, child]) => {
    const path = prefix === "" ? key : `${prefix}.${key}`
    return [path, ...keyPaths(child, path)]
  })
}
