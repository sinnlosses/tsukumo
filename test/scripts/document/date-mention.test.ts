import { describe, expect, it } from "vitest"

import {
  countByRange,
  findDateMentions,
  findFrozenMismatches,
  rangeOf,
} from "../../../scripts/document/date-mention.ts"
import { collectDateMentions } from "../../../scripts/document/lib/date-mention-repository.ts"
import { REPOSITORY_ROOT } from "../../../scripts/shared/repository-root.ts"

const SAMPLE_DATE = ["2026", "10", "27"].join("-")
const OTHER_DATE = ["2026", "09", "01"].join("-")

// 日付の行を直したら値を下げる（下げ忘れも落ちる）。増やす変更は通らない。
const FROZEN_DATE_LINE_COUNTS = {
  "docs-root": 26,
  architecture: 18,
  "architecture/build": 8,
  "architecture/chat-mode": 52,
  "architecture/display": 7,
  "architecture/screen-design": 20,
  "architecture/testing": 5,
  "coding-standards": 19,
  requirements: 142,
  workflow: 9,
} as const satisfies Record<string, number>

const MAX_FROZEN_RANGES = 100

describe("findDateMentions", () => {
  it("日付を含む行を拾う", () => {
    expect(findDateMentions("sample.md", `前\n（${SAMPLE_DATE} 決定）\n`)).toEqual([
      { sourcePath: "sample.md", line: 2 },
    ])
  })

  it("日付入りのファイル名は拾わない", () => {
    expect(findDateMentions("sample.md", `![図](mockup-${SAMPLE_DATE}.png)`)).toEqual([])
  })

  it("「…」で引いた節名の日付は拾わない", () => {
    expect(findDateMentions("sample.md", `「覆した（${SAMPLE_DATE}）」を見る`)).toEqual([])
  })

  it("同じ行にファイル名があっても、別の日付は拾う", () => {
    expect(
      findDateMentions("sample.md", `mockup-${SAMPLE_DATE}.html と ${OTHER_DATE} 改訂`),
    ).toHaveLength(1)
  })

  it("日付が無ければ空", () => {
    expect(findDateMentions("sample.md", "いまの形だけ")).toEqual([])
  })
})

describe("rangeOf", () => {
  it("範囲を決める", () => {
    expect(rangeOf("docs/architecture/display/aside.md")).toBe("architecture/display")
    expect(rangeOf("docs/architecture/browser.md")).toBe("architecture")
    expect(rangeOf("docs/glossary/block.md")).toBe("glossary")
    expect(rangeOf("docs/architecture.md")).toBe("docs-root")
  })
})

describe("findFrozenMismatches", () => {
  it("増えた・減った・一覧に無い範囲を知らせ、同じなら空", () => {
    expect(findFrozenMismatches({ a: 2 }, { a: 2 })).toEqual([])
    expect(findFrozenMismatches({ a: 2 }, { a: 3 })).toHaveLength(1)
    expect(findFrozenMismatches({ a: 2 }, { a: 1 })).toHaveLength(1)
    expect(findFrozenMismatches({}, { b: 1 })).toHaveLength(1)
  })

  it("読む側が空の結果を返すと、凍結した範囲が全部「減った」で落ちる", () => {
    expect(findFrozenMismatches(FROZEN_DATE_LINE_COUNTS, countByRange([]))).toHaveLength(
      Object.keys(FROZEN_DATE_LINE_COUNTS).length,
    )
  })
})

describe("docs/ の日付", () => {
  it("凍結した一覧の項目数が上限以下", () => {
    expect(Object.keys(FROZEN_DATE_LINE_COUNTS).length).toBeLessThanOrEqual(MAX_FROZEN_RANGES)
  })

  it("範囲ごとの日付の行数が、凍結した一覧と一致する", () => {
    expect(
      findFrozenMismatches(
        FROZEN_DATE_LINE_COUNTS,
        countByRange(collectDateMentions(REPOSITORY_ROOT)),
      ),
    ).toEqual([])
  })
})
