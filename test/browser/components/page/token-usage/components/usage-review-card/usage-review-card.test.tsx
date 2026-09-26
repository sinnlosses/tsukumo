import { afterEach, describe, expect, it } from "bun:test"

import { cleanup, fireEvent, render } from "@testing-library/react"

import { UsageReviewCard } from "../../../../../../../src/browser/components/page/token-usage/components/usage-review-card/usage-review-card.tsx"
import {
  type UsageReviewResultProposalView,
  type UsageReviewStageView,
  type UseUsageReviewResult,
} from "../../../../../../../src/browser/components/page/token-usage/hooks/use-usage-review.ts"

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
    const { getByRole, getByText } = render(<UsageReviewCard review={review} />)

    const startButton = getByRole("button", { name: "減らし方を見てもらう" })
    // 押せないは `aria-disabled` の1通り（`Button`）。本物の `disabled` にはしないので、
    // フォーカスは残る（`button.test.tsx` と同じ確かめ方）。
    expect(startButton.getAttribute("aria-disabled")).toBe("true")
    expect(startButton.hasAttribute("disabled")).toBe(false)
    startButton.focus()
    expect(document.activeElement).toBe(startButton)
    expect(
      getByText("いまターンが動いているので送れない。終わってからもう一度押す。"),
    ).not.toBeNull()
  })

  it("押せないあいだ「減らし方を見てもらう」を押しても依頼を送らない", () => {
    let started = 0
    const review: UseUsageReviewResult = {
      ...IDLE_AVAILABLE,
      start: { kind: "blocked", reason: "" },
      onStart: () => (started += 1),
    }
    const { getByRole } = render(<UsageReviewCard review={review} />)

    fireEvent.click(getByRole("button", { name: "減らし方を見てもらう" }))

    expect(started).toBe(0)
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

describe("UsageReviewCard（結果）", () => {
  const FIXTURE_PROPOSALS: readonly UsageReviewResultProposalView[] = [
    {
      key: "tool-result:Bash",
      impact: "large",
      title: "Bash の出力を絞る",
      basis: "Bash を多く呼び、結果が大きい。",
      action: "head / tail / grep で必要な行だけ受け取る。",
      followUp: "delegate",
      onPrimary: () => {},
      onDismiss: () => {},
    },
    {
      key: "model-choice:",
      impact: "medium",
      title: "長いセッションは区切る",
      basis: "キャッシュ読みが多い。",
      action: "タスクが一区切りしたら /compact する。",
      followUp: "task",
      onPrimary: () => {},
      onDismiss: () => {},
    },
  ]

  const resultReview: UseUsageReviewResult = {
    kind: "result",
    face: FIXTURE_FACE,
    reviewedAtLabel: "09-23 15:40",
    periodLabel: "直近 7 日",
    headline: "見てきたぞ！ 効きそうなのは 2 つ。",
    proposals: FIXTURE_PROPOSALS,
    retry: { kind: "available" },
    onRetry: () => {},
    close: { kind: "none" },
  }

  it("提案の数だけ札が出て、効きめと主ボタンの文言が中身どおりになる", () => {
    const { container, getByText } = render(<UsageReviewCard review={resultReview} />)

    expect(container.querySelectorAll(".usage-review-proposal")).toHaveLength(2)
    expect(getByText("Bash の出力を絞る")).not.toBeNull()
    expect(getByText("長いセッションは区切る")).not.toBeNull()
    expect(getByText("大")).not.toBeNull()
    expect(getByText("中")).not.toBeNull()
    expect(getByText("tsukumo に頼む")).not.toBeNull()
    expect(getByText("タスクにする")).not.toBeNull()
    expect(getByText("09-23 15:40 · 直近 7 日")).not.toBeNull()
    expect(getByText("見てきたぞ！ 効きそうなのは 2 つ。")).not.toBeNull()
  })

  it("主ボタンで依頼が1回送られ、「見送る」でコマンドが1回送られる", () => {
    let primaryCalled = 0
    let dismissCalled = 0
    const review: UseUsageReviewResult = {
      ...resultReview,
      proposals: [
        {
          ...FIXTURE_PROPOSALS[0]!,
          onPrimary: () => (primaryCalled += 1),
          onDismiss: () => (dismissCalled += 1),
        },
      ],
    }
    const { getByText } = render(<UsageReviewCard review={review} />)

    fireEvent.click(getByText("tsukumo に頼む"))
    fireEvent.click(getByText("見送る"))

    expect(primaryCalled).toBe(1)
    expect(dismissCalled).toBe(1)
  })

  it("提案が0件のときは一言だけ出る", () => {
    const review: UseUsageReviewResult = { ...resultReview, proposals: [] }
    const { getByText, container } = render(<UsageReviewCard review={review} />)

    expect(getByText("いま出せる提案は無い。")).not.toBeNull()
    expect(container.querySelectorAll(".usage-review-proposal")).toHaveLength(0)
  })

  it("もう一度見てもらうを押すと retry が1回呼ばれる", () => {
    let retried = 0
    const review: UseUsageReviewResult = { ...resultReview, onRetry: () => (retried += 1) }
    const { getByText } = render(<UsageReviewCard review={review} />)

    fireEvent.click(getByText("もう一度見てもらう"))

    expect(retried).toBe(1)
  })

  it("ターンが進行中は主ボタンともう一度見てもらうが押せず、理由が出る", () => {
    const review: UseUsageReviewResult = {
      ...resultReview,
      retry: {
        kind: "blocked",
        reason: "いまターンが動いているので送れない。終わってからもう一度押す。",
      },
    }
    const { getByText } = render(<UsageReviewCard review={review} />)

    expect(getByText("もう一度見てもらう").hasAttribute("disabled")).toBe(true)
    expect(getByText("tsukumo に頼む").hasAttribute("disabled")).toBe(true)
    expect(
      getByText("いまターンが動いているので送れない。終わってからもう一度押す。"),
    ).not.toBeNull()
  })

  it("「見送る」はターンが進行中でも押せる", () => {
    const review: UseUsageReviewResult = {
      ...resultReview,
      retry: { kind: "blocked", reason: "いまターンが動いているので送れない。" },
    }
    const { getAllByText } = render(<UsageReviewCard review={review} />)

    for (const dismiss of getAllByText("見送る")) {
      expect(dismiss.hasAttribute("disabled")).toBe(false)
    }
  })

  it("「前回の提案」から開いたときだけ「閉じる」が出て、押すと close が1回呼ばれる", () => {
    const { queryByText } = render(<UsageReviewCard review={resultReview} />)
    expect(queryByText("閉じる")).toBeNull()

    let closed = 0
    const withClose: UseUsageReviewResult = {
      ...resultReview,
      close: { kind: "shown", onClose: () => (closed += 1) },
    }
    const { getByText } = render(<UsageReviewCard review={withClose} />)

    fireEvent.click(getByText("閉じる"))
    expect(closed).toBe(1)
  })
})
