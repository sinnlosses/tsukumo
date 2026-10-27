import { describe, expect, test } from "vitest"

import {
  countBySource,
  findHubPaths,
  findHubReferenceDrifts,
  findHubReferences,
  formatHubReferenceDrift,
} from "../../../scripts/document/hub-reference.ts"
import type { SectionReference } from "../../../scripts/document/section-reference.ts"

const HUB = `docs/${"hub"}.md`
const CHILD = `docs/${"hub"}/${"child"}.md`
const PLAIN = `docs/${"plain"}.md`

function reference(sourcePath: string, targetPath: string): SectionReference {
  return { sourcePath, line: 1, targetPath, section: undefined, phrase: "句" }
}

describe("findHubPaths", () => {
  test("子のディレクトリに .md を持つファイルだけをハブにする", () => {
    expect([...findHubPaths([HUB, CHILD, PLAIN])]).toEqual([HUB])
  })

  test("名前の前半が同じだけのファイルは子にしない", () => {
    expect([...findHubPaths([HUB, `docs/${"hub"}-other.md`])]).toEqual([])
  })
})

describe("findHubReferences と countBySource", () => {
  const references = [
    reference("a.md", HUB),
    reference("a.md", HUB),
    reference("b.md", CHILD),
    reference("b.md", HUB),
  ]

  test("ハブを指す参照だけを残し、書いているファイルごとに数える", () => {
    const hubReferences = findHubReferences(references, new Set([HUB]))
    expect(countBySource(hubReferences)).toEqual({ "a.md": 2, "b.md": 1 })
  })
})

describe("findHubReferenceDrifts", () => {
  test("凍結した件数と同じなら食い違いなし", () => {
    expect(findHubReferenceDrifts({ "a.md": 2 }, { "a.md": 2 })).toEqual([])
  })

  test("件数が増えた・一覧に無いファイルに現れた参照を返す", () => {
    expect(findHubReferenceDrifts({ "a.md": 3, "new.md": 1 }, { "a.md": 2 })).toEqual([
      { sourcePath: "a.md", actual: 3, frozen: 2 },
      { sourcePath: "new.md", actual: 1, frozen: 0 },
    ])
  })

  test("件数が減ったのに一覧がそのままのものも返す", () => {
    const drifts = findHubReferenceDrifts({}, { "a.md": 2 })
    expect(drifts.map(formatHubReferenceDrift)).toEqual([
      "a.md: 凍結 2 件 → 実際 0 件（参照が減った。凍結の一覧の件数を減らす）",
    ])
  })
})
