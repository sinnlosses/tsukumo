import { afterEach, describe, expect, it } from "bun:test"

import { cleanup, fireEvent, render } from "@testing-library/react"

import {
  type UsageReviewStageView,
  type UseUsageReviewResult,
} from "../../../../src/browser/features/token-usage/hooks/use-usage-review.ts"
import { UsageReviewCard } from "../../../../src/browser/features/token-usage/usage-review-card.tsx"

/**
 * 見た目だけを測る（`hooks/use-usage-review.ts` は素通しなので、フィクスチャは手で書いた
 * 架空の値をそのまま渡す。`docs/coding-standards.md`「会話内容の扱い」— 実物の会話・記録は
 * 使わない）。
 */

afterEach(() => {
  cleanup()
})

const FIXTURE_FACE = { url: undefined, alt: "" }

const IDLE_AVAILABLE: UseUsageReviewResult = {
  kind: "idle",
  face: FIXTURE_FACE,
  start: { kind: "available" },
  onStart: () => {},
  previousReview: { kind: "none" },
}

const FIXTURE_STAGES: readonly UsageReviewStageView[] = [
  {
    stage: "model",
    label: "モデルの使い分けを見る",
    status: "done",
    count: { kind: "shown", label: "4 モデル" },
  },
  {
    stage: "cache",
    label: "キャッシュの効き方を見る",
    status: "done",
    count: { kind: "shown", label: "読み 1.28M" },
  },
  {
    stage: "tool",
    label: "ツールの呼び方と結果の大きさを見る",
    status: "running",
    count: { kind: "shown", label: "16 種類" },
  },
  {
    stage: "context",
    label: "コンテキストの中身を見る",
    status: "pending",
    count: { kind: "none" },
  },
  { stage: "proposal", label: "見直し案をまとめる", status: "pending", count: { kind: "none" } },
]

describe("UsageReviewCard（ふだん）", () => {
  it("ボタンを押すと依頼が1回送られる", () => {
    let started = 0
    const review: UseUsageReviewResult = { ...IDLE_AVAILABLE, onStart: () => (started += 1) }
    const { getByText } = render(<UsageReviewCard review={review} />)

    fireEvent.click(getByText("減らし方を見てもらう"))

    expect(started).toBe(1)
  })

  it("ターンが進行中・雑談中は押せず、理由が出る", () => {
    const review: UseUsageReviewResult = {
      ...IDLE_AVAILABLE,
      start: {
        kind: "blocked",
        reason: "いまターンが動いているので送れない。終わってからもう一度押す。",
      },
    }
    const { getByText } = render(<UsageReviewCard review={review} />)

    expect(getByText("減らし方を見てもらう").hasAttribute("disabled")).toBe(true)
    expect(
      getByText("いまターンが動いているので送れない。終わってからもう一度押す。"),
    ).not.toBeNull()
  })

  it("前回の提案が無いときはリンクが出ない", () => {
    const { queryByText } = render(<UsageReviewCard review={IDLE_AVAILABLE} />)

    expect(queryByText(/前回の提案/)).toBeNull()
  })

  it("前回の提案があるときは日付つきのリンクが出て、押すと開く口が呼ばれる", () => {
    let opened = 0
    const review: UseUsageReviewResult = {
      ...IDLE_AVAILABLE,
      previousReview: { kind: "found", dateLabel: "09-16", onOpen: () => (opened += 1) },
    }
    const { getByText } = render(<UsageReviewCard review={review} />)

    const link = getByText("前回の提案（09-16）")
    expect(link).not.toBeNull()
    fireEvent.click(link)
    expect(opened).toBe(1)
  })
})

describe("UsageReviewCard（見直し中）", () => {
  const runningReview: UseUsageReviewResult = {
    kind: "running",
    face: FIXTURE_FACE,
    elapsedText: "24秒",
    speech: { kind: "said", text: "ツールの結果がでっかいのが気になるな…" },
    onInterrupt: () => {},
    stages: FIXTURE_STAGES,
  }

  it("段の印は済 / 進行中 / 未着手で分かれ、数はモデル・キャッシュ・ツールの3段だけに出る", () => {
    const { container, getByText } = render(<UsageReviewCard review={runningReview} />)

    const marks = [...container.querySelectorAll(".usage-review-stage-mark")].map(
      (node) => node.textContent,
    )
    expect(marks).toEqual(["✓", "✓", "…", "○", "○"])
    expect(getByText("4 モデル")).not.toBeNull()
    expect(getByText("読み 1.28M")).not.toBeNull()
    expect(getByText("16 種類")).not.toBeNull()
    expect(container.querySelectorAll(".usage-review-stage-count")).toHaveLength(3)
  })

  it("経過と直近のセリフが出る", () => {
    const { getByText } = render(<UsageReviewCard review={runningReview} />)

    expect(getByText("24秒")).not.toBeNull()
    expect(getByText("「ツールの結果がでっかいのが気になるな…」")).not.toBeNull()
  })

  it("まだセリフが無ければ、その行を出さない", () => {
    const review: UseUsageReviewResult = { ...runningReview, speech: { kind: "none" } }
    const { container } = render(<UsageReviewCard review={review} />)

    expect(container.querySelector(".usage-review-speech")).toBeNull()
  })

  it("「止める」を押すと interrupt が1回呼ばれる", () => {
    let interrupted = 0
    const review: UseUsageReviewResult = { ...runningReview, onInterrupt: () => (interrupted += 1) }
    const { getByText } = render(<UsageReviewCard review={review} />)

    fireEvent.click(getByText("止める"))

    expect(interrupted).toBe(1)
  })
})
