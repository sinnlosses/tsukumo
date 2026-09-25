import { afterEach, describe, expect, it } from "bun:test"

import { cleanup, render } from "@testing-library/react"

import { ContextUsageCard } from "../../../../../src/browser/components/page/token-usage/context-usage-card.tsx"
import { type UseContextUsageResult } from "../../../../../src/browser/domain/context-usage.ts"
import { contextUsage } from "../../../../fixture/context-usage.ts"

// いまのコンテキストの内訳の札（`context-usage-card.tsx`）。**フックは素通し**なので、畳んだ
// 形を手で書いて渡す（架空の内訳。docs/coding-standards.md「会話内容の扱い」）。
//
// **見えているかどうかは目視で確かめる**（docs/coding-standards.md「DOM の構造と画面の流れは
// E2E、見た目は目視」）。ここで測るのは、どの行がどの順で出て、数がどう書かれるかまで。

afterEach(() => {
  cleanup()
})

/** 内訳を取った時刻（架空の固定値。**時刻そのものは測らない**ので、値は何でもよい）。 */
const TAKEN_AT = Temporal.ZonedDateTime.from({
  year: 2001,
  month: 2,
  day: 3,
  hour: 4,
  minute: 5,
  timeZone: Temporal.Now.timeZoneId(),
}).epochMilliseconds

/** 畳んだ札1枚（`browser/domain/context-usage.ts` が返すのと同じ形）。 */
function readyCard(overrides: Partial<Parameters<typeof contextUsage>[0]> = {}): {
  readonly card: UseContextUsageResult
} {
  const usage = contextUsage(overrides)
  const rows = (kind: string): readonly UsageRow[] =>
    usage.categories
      .filter((category) => category.kind === kind && category.tokens > 0)
      .map((category) => ({
        name: category.name,
        kind: category.kind,
        tokens: category.tokens,
        share: (category.tokens / usage.maxTokens) * 100,
      }))

  return {
    card: {
      kind: "ready",
      model: usage.model,
      totalTokens: usage.totalTokens,
      maxTokens: usage.maxTokens,
      percentage: usage.percentage,
      untilCompactTokens: rows("free").reduce((total, row) => total + row.tokens, 0),
      rows: [...rows("used"), ...rows("free"), ...rows("buffer")],
      deferredRows: rows("deferred"),
      mcpTools: usage.mcpTools,
      memoryFiles: usage.memoryFiles,
      skills: usage.skills,
      takenAt: TAKEN_AT,
    },
  }
}

type UsageRow = Extract<UseContextUsageResult, { kind: "ready" }>["rows"][number]

describe("ContextUsageCard", () => {
  it("横棒は中身・空き・自動圧縮バッファだけを積む（窓の外の分類は積まない）", () => {
    const { container } = render(<ContextUsageCard {...readyCard()} />)

    // 架空の内訳は used が4つ・free が1つ・buffer が1つ（deferred の1つは入らない）。
    expect(container.querySelectorAll(".context-span")).toHaveLength(6)
    expect(container.querySelectorAll(".context-legend-row")).toHaveLength(6)
  })

  it("分類名を日本語にし、空きと自動圧縮バッファも凡例に並べる", () => {
    const { queryAllByText, queryByText } = render(<ContextUsageCard {...readyCard()} />)

    expect(queryByText("システムプロンプト")).not.toBeNull()
    // 「メモリファイル」は凡例と畳んだ内訳の見出しの両方に出る。
    expect(queryAllByText("メモリファイル")).toHaveLength(2)
    expect(queryByText("メッセージ")).not.toBeNull()
    expect(queryByText("空き")).not.toBeNull()
    expect(queryByText("自動圧縮バッファ")).not.toBeNull()
  })

  it("知らない分類は英語のまま出す", () => {
    const { queryByText } = render(
      <ContextUsageCard
        {...readyCard({
          categories: [{ name: "Something new", tokens: 1000, kind: "used" }],
        })}
      />,
    )

    expect(queryByText("Something new")).not.toBeNull()
  })

  it("使っている量・窓の大きさ・割合と、自動圧縮までの残りを出す", () => {
    const { container, queryByText } = render(<ContextUsageCard {...readyCard()} />)

    expect(queryByText("60.0k")).not.toBeNull()
    expect(queryByText("/ 200k")).not.toBeNull()
    expect(queryByText("30%")).not.toBeNull()
    // 「自動圧縮まで」だけ字の色が違うので要素が割れている。読める文は札1つぶんで測る。
    expect(container.querySelector(".context-until")?.textContent).toBe("自動圧縮まで あと 95.0k")
  })

  it("窓の外の分類は畳んだ内訳の中に出す", () => {
    const { queryByText } = render(<ContextUsageCard {...readyCard()} />)

    expect(queryByText("MCP ツール（窓の外）")).not.toBeNull()
  })

  it("取れなかったときは札を出さず、一言だけにする", () => {
    const { container, queryByText } = render(<ContextUsageCard card={{ kind: "unavailable" }} />)

    expect(container.querySelectorAll(".context-card")).toHaveLength(0)
    expect(queryByText("いまのコンテキストはまだ取れていない")).not.toBeNull()
  })

  it("読み込み中は骨組みの section を出す（取れなかったときとは別の描画）", () => {
    const { container, queryByText } = render(<ContextUsageCard card={{ kind: "pending" }} />)

    const section = container.querySelector(".context-card")
    expect(section).not.toBeNull()
    expect(section?.getAttribute("aria-busy")).toBe("true")
    // 取れなかったときの一言は出さない。
    expect(queryByText("いまのコンテキストはまだ取れていない")).toBeNull()
  })

  it("骨組みの凡例は8行（中身6分類 + 空き + 自動圧縮バッファ。窓の外は数えない）", () => {
    const { container } = render(<ContextUsageCard card={{ kind: "pending" }} />)

    expect(container.querySelectorAll(".context-legend-row")).toHaveLength(8)
  })

  it("骨組みは見出し・添え書き・分類名を実物と同じ文字で出す", () => {
    const { queryByText } = render(<ContextUsageCard card={{ kind: "pending" }} />)

    expect(queryByText("いまのコンテキスト")).not.toBeNull()
    expect(queryByText("このセッション · /context と同じ内容")).not.toBeNull()
    expect(queryByText("自動圧縮まで")).not.toBeNull()
    expect(queryByText("システムプロンプト")).not.toBeNull()
    expect(queryByText("空き")).not.toBeNull()
    expect(queryByText("自動圧縮バッファ")).not.toBeNull()
    expect(queryByText("MCP ツール・メモリファイル・スキルの内訳を見る")).not.toBeNull()
  })

  it("骨組みの値の塊は読み上げに出さない（aria-hidden）", () => {
    const { container } = render(<ContextUsageCard card={{ kind: "pending" }} />)

    const blocks = container.querySelectorAll('[aria-hidden="true"]')
    // 自動圧縮まで(1)・更新時刻(1)・使っている量/窓の大きさ/割合(3)・横棒(1)・凡例8行の値(8)で14個。
    expect(blocks).toHaveLength(14)
    // 横棒だけは中身が無い空の塊（高さは親の `stretch` が決めるので `&nbsp;` を持たない）。
    // それ以外は、行の高さを実物の文字と揃えるための `&nbsp;` を持つ（見た目には出ない）。
    const withText = [...blocks].filter((block) => block.textContent !== "")
    expect(withText).toHaveLength(13)
    for (const block of withText) {
      expect(block.textContent).toBe("\u00a0")
    }
  })
})
