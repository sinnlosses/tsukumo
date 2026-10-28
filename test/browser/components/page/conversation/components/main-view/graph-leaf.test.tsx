import { cleanup } from "@testing-library/react"
import { afterEach, beforeAll, describe, expect, it } from "vitest"

import { loadMarkdown } from "../../../../../../../src/browser/components/page/conversation/components/markdown/markdown.tsx"
import { newLeafHtml, oldLeafHtml } from "../../../../../../fixture/direct-leaf-compare.tsx"

beforeAll(async () => {
  await loadMarkdown()
})

afterEach(() => {
  cleanup()
})

const CHAIN = "甲 | 説明 @a\n+ 乙\n丙\n甲 -> 乙: 渡す @b\n~ 乙 -> 丙"

const FOLD = [
  "[甲の群]",
  "入口 | 架空の呼び出しを送る",
  "直し | 直す欄だけ",
  "[]",
  "[乙の群 @c]",
  "検査 | 省いた欄は引き継ぐ",
  "判定 | 関門を上から順に",
  "通過",
  "記録",
  "[]",
  "整形",
  "描画",
  "出口",
  "関所 | 呼ばずに止まろうとしたとき",
  "入口 -> 検査: 渡す",
  "検査 -> 判定: 揃える",
  "判定 -> 通過: 違反なし",
  "通過 -> 記録",
  "記録 -> 整形",
  "整形 -> 描画",
  "描画 -> 出口",
  "直し <- 判定: 違反あり",
  "検査 <- 直し: 呼び直す",
  "入口 <- 関所: 呼び直させる",
].join("\n")

const BRANCH = "甲 -> 乙: 分ける\n甲 -> 丙\n丙 | 説明 -> 丁"

function pair(source: string, legend: readonly { tone: "a" | "b"; label: string }[], fold = "") {
  const fields = { title: "架空の図", direction: "LR" as const, legend: [...legend], source }
  return {
    block: { kind: "graph", ...fields, fold, aside: "" } as const,
    part: { id: "g1", component: "Graph", ...fields, fold, aside: "" } as const,
  }
}

describe("Graph の部品", () => {
  it("5 節点以下の一本道はカードの連鎖で、旧い描画と一致する", () => {
    const { block, part } = pair(CHAIN, [{ tone: "a", label: "架空の色" }])
    const fresh = newLeafHtml(block, part)

    expect(fresh).toContain("report-card-chain")
    expect(fresh).toBe(oldLeafHtml(block))
  })

  it("主経路の長い図は折り返しの svg で、旧い描画と一致する", () => {
    const { block, part } = pair(FOLD, [])
    const fresh = newLeafHtml(block, part)

    expect(fresh).toContain("data-graph")
    expect(fresh).toBe(oldLeafHtml(block))
  })

  it("それ以外は mermaid の描画に回り、旧い描画と一致する", () => {
    const { block, part } = pair(BRANCH, [])
    const fresh = newLeafHtml(block, part)

    expect(fresh).toContain('class="mermaid')
    expect(fresh).toBe(oldLeafHtml(block))
  })

  it("畳みがあれば題の包みごと details で包んで旧い描画と一致する", () => {
    const { block, part } = pair(CHAIN, [], "架空の畳み")

    expect(newLeafHtml(block, part)).toBe(oldLeafHtml(block))
  })
})
