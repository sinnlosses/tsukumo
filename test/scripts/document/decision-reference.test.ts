import { describe, expect, it } from "vitest"

import {
  findDecisionReferences,
  findStrayDecisionReferences,
  formatStrayDecisionReference,
  readDecisionHeadings,
} from "../../../scripts/document/decision-reference.ts"
import { collectStrayDecisionReferences } from "../../../scripts/document/lib/decision-reference-repository.ts"
import { REPOSITORY_ROOT } from "../../../scripts/shared/repository-root.ts"

const HEADINGS = ["画面の吹き出しを変えた経緯", "入れ子「例」の節"]

// 検査が test/ の本文も読むので、パスはここで組み立てて本文に書かない。
const DECISION = ["docs", "history", "decision.md"].join("/")

function stray(afterPath: string): number {
  const references = findDecisionReferences("sample.md", `${DECISION}${afterPath}`)
  return findStrayDecisionReferences(references, HEADINGS).length
}

describe("readDecisionHeadings", () => {
  it("見出しを拾い、コードブロック内と本文は除く", () => {
    const text = "# 表題\n## 節A\n本文\n```\n## 偽\n```\n### 節B\n"
    expect(readDecisionHeadings(text)).toEqual(["節A", "節B"])
  })
})

describe("findStrayDecisionReferences", () => {
  it("見出しと一致する句は通す", () => {
    expect(stray("「画面の吹き出しを変えた経緯」を見る")).toBe(0)
  })

  it("見出しの前半に前方一致する句は通す", () => {
    expect(stray("「画面の吹き出し」を見る")).toBe(0)
  })

  it("末尾の「…」は外して照らす", () => {
    expect(stray("「画面の吹き出し…」を見る")).toBe(0)
  })

  it("行をまたぐ折り返しは空白を除いて照らす", () => {
    expect(stray("「画面の\n吹き出しを変えた経緯」")).toBe(0)
  })

  it("入れ子の鉤括弧を含む句を照らす", () => {
    expect(stray("「入れ子「例」の節」")).toBe(0)
  })

  it("見出しに無い句は食い違いになる", () => {
    const references = findDecisionReferences("sample.md", `前\n${DECISION}「存在しない節」`)
    const found = findStrayDecisionReferences(references, HEADINGS)
    expect(found).toHaveLength(1)
    expect(formatStrayDecisionReference(found[0]!)).toContain("sample.md:2")
  })

  it("decision.md 以外を引く参照は拾わない", () => {
    const otherPath = ["docs", "other.md"].join("/")
    expect(findDecisionReferences("sample.md", `${otherPath}「何か」`)).toEqual([])
  })
})

describe("docs/ の decision.md への参照", () => {
  it("すべて見出しに前方一致する", () => {
    expect(
      collectStrayDecisionReferences(REPOSITORY_ROOT).map(formatStrayDecisionReference),
    ).toEqual([])
  })
})
