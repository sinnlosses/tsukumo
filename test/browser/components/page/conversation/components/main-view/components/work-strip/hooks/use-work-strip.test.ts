import { act, cleanup, renderHook } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { useWorkStrip } from "../../../../../../../../../../src/browser/components/page/conversation/components/main-view/components/work-strip/hooks/use-work-strip.ts"
import { useMainViewContent } from "../../../../../../../../../../src/browser/stores/main-view-content.ts"
import {
  useReadingSection,
  type ReadingSection,
} from "../../../../../../../../../../src/browser/stores/reading-section.ts"
import type { SessionEvent } from "../../../../../../../../../../src/shared/session/session-event.ts"
import {
  foldTimed,
  plan,
  request,
  START,
  stripAt,
} from "../../../../../../../../../fixture/work-strip.ts"
import { putSession } from "../../../../../../../../session-store.ts"

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

function bashStarted(id: string): SessionEvent {
  return {
    kind: "tool-started",
    toolUseId: id,
    name: "Bash",
    input: { command: "架空のコマンド" },
    parentToolUseId: undefined,
  }
}

describe("useWorkStrip（時刻に依るもの）", () => {
  it("走っている手順の要約に、その手順が始まってからの秒を添え、右端は依頼からの経過", () => {
    const state = foldTimed([
      [request, START],
      [plan, START + 1_000],
      [bashStarted("toolu_1"), START + 60_000],
    ])

    const strip = stripAt(state, START + 72_000)

    expect(strip.kind).toBe("working")
    expect(strip.kind === "working" && strip.activity.text).toBe("Bash  架空のコマンド · 12秒")
    expect(strip.kind === "working" && strip.sideLabel).toBe("経過 1分12秒")
  })

  it("答え待ちの秒は、答え待ちが届いた時刻から数える", () => {
    const state = foldTimed([
      [request, START],
      [plan, START + 1_000],
      [bashStarted("toolu_ask"), START + 10_000],
      [
        {
          kind: "pending-changed",
          pending: [
            {
              kind: "permission",
              id: "toolu_ask",
              toolName: "Bash",
              input: { command: "架空のコマンド" },
            },
          ],
        },
        START + 11_000,
      ],
    ])

    const strip = stripAt(state, START + 18_000)

    expect(strip.kind === "working" && strip.activity.text).toBe(
      "お伺いが届いた · 許可: Bash  架空のコマンド · 答え待ち 7秒",
    )
    expect(
      strip.kind === "working" &&
        strip.phases.map((slot) => (slot.kind === "phase" ? slot.phase.state : slot.state)),
    ).toEqual(["asking", "upcoming"])
  })

  it("答え待ちと同じ id の手順が無くても、届いた時刻から秒を添える", () => {
    const state = foldTimed([
      [request, START],
      [plan, START + 1_000],
      [
        {
          kind: "pending-changed",
          pending: [
            {
              kind: "permission",
              id: "toolu_unknown",
              toolName: "Bash",
              input: { command: "架空のコマンド" },
            },
          ],
        },
        START + 11_000,
      ],
    ])

    const strip = stripAt(state, START + 18_000)

    expect(strip.kind === "working" && strip.activity.text).toBe(
      "お伺いが届いた · 許可: Bash  架空のコマンド · 答え待ち 7秒",
    )
  })

  it("ターンが終わってレポートに入れ替わると、右端は終わった時刻で止まった所要", () => {
    const state = foldTimed([
      [request, START],
      [plan, START + 1_000],
      [{ ...plan, current: 2 }, START + 100_000],
      [{ kind: "turn-finished", outcome: { kind: "completed" } }, START + 125_000],
    ])

    const strip = stripAt(state, START + 600_000)

    expect(strip).toMatchObject({
      kind: "finished",
      headLabel: "2段すべて済み",
      sideLabel: "所要 2分05秒",
    })
  })

  it("範囲が pending のあいだは、前の段だけを数え、範囲の先頭の丸を「…」・その後ろを「・」にする", () => {
    const pending: SessionEvent = {
      ...plan,
      delegatedRange: { kind: "pending", first: 1 },
      phases: ["架空の計画", "架空の段", "架空の受け入れ"],
    }
    const strip = stripAt(
      foldTimed([
        [request, START],
        [pending, START + 1_000],
      ]),
      START + 5_000,
    )

    expect(strip).toMatchObject({
      kind: "working",
      headLabel: "架空の計画",
      positionLabel: "前 1/1",
      sideLabel: "経過 5秒",
    })
    expect(
      strip.kind === "working" &&
        strip.phases.map((slot) => slot.kind === "phase" && slot.phase.mark),
    ).toEqual(["1", "…", "・"])
  })

  it("範囲があれば、群の先頭の丸に群の名を付け、今の群の名を目立たせ、右端に群の中の位置を出す", () => {
    const ranged: SessionEvent = {
      ...plan,
      delegatedRange: { kind: "range", first: 1, count: 2 },
      phases: ["架空の計画", "架空の段A", "架空の段B", "架空の受け入れ", "架空の送り出し"],
      current: 3,
      phaseSummary: "架空のまとめ。",
    }
    const strip = stripAt(
      foldTimed([
        [request, START],
        [ranged, START + 1_000],
      ]),
      START + 5_000,
    )

    expect(strip).toMatchObject({ kind: "working", positionLabel: "後 1/2" })
    expect(strip.kind === "working" && strip.phases.map((slot) => slot.spanHead)).toEqual([
      { kind: "head", name: "前", current: false },
      { kind: "head", name: "本", current: false },
      { kind: "none" },
      { kind: "head", name: "後", current: true },
      { kind: "none" },
    ])
    expect(
      strip.kind === "working" &&
        strip.phases.map((slot) => slot.kind === "phase" && slot.phase.mark),
    ).toEqual(["✓", "✓", "✓", "1", "2"])
  })

  it("範囲の中が全部済んで外の段が残ったまま閉じたら、結果の見出しは全部の段で数える", () => {
    const ranged: SessionEvent = {
      ...plan,
      delegatedRange: { kind: "range", first: 1, count: 2 },
      phases: ["架空の計画", "架空の段A", "架空の段B", "架空の受け入れ"],
    }
    const closed = (current: number) =>
      stripAt(
        foldTimed([
          [request, START],
          [{ ...ranged, current }, START + 1_000],
          [{ kind: "turn-finished", outcome: { kind: "completed" } }, START + 5_000],
        ]),
        START + 6_000,
      )

    expect(closed(3)).toMatchObject({ kind: "finished", headLabel: "4段のうち3段済み" })
    expect(closed(4)).toMatchObject({ kind: "finished", headLabel: "4段すべて済み" })
  })

  it("閉じたあとの続きのターンが走っているあいだは、済み具合でなく今の段の名前を出す", () => {
    vi.spyOn(Temporal.Now, "instant").mockReturnValue(
      Temporal.Instant.fromEpochMilliseconds(START + 7_000),
    )
    putSession(
      foldTimed([
        [request, START],
        [{ ...plan, current: 1 }, START + 1_000],
        [{ kind: "turn-finished", outcome: { kind: "completed" } }, START + 5_000],
        [{ kind: "turn-resumed" }, START + 6_000],
      ]),
    )
    act(() => {
      useMainViewContent.setState({ content: { kind: "report", exchange: 1, arrived: true } })
    })
    const strip = renderHook(() => useWorkStrip()).result.current

    expect(strip).toMatchObject({ kind: "finished", result: "working", headLabel: "架空の段B" })
  })

  it("委譲中に送った脇の話のあいだも、親のワークプラン・今の段・依頼からの経過を出し続ける", () => {
    const state = foldTimed([
      [request, START],
      [plan, START + 1_000],
      [{ ...plan, current: 1, phaseSummary: "架空のまとめ。" }, START + 2_000],
      [
        {
          kind: "background-tasks-changed",
          tasks: [{ taskId: "fictional-task", kind: "agent", description: "架空の委譲" }],
        },
        START + 3_000,
      ],
      [{ kind: "turn-finished", outcome: { kind: "completed" } }, START + 4_000],
      [{ kind: "aside", text: "架空の問い", images: [] }, START + 60_000],
      [{ kind: "speech", text: "架空の答え", expression: "default" }, START + 61_000],
    ])

    const strip = stripAt(state, START + 72_000)

    expect(strip).toMatchObject({
      kind: "working",
      headLabel: "架空の段B",
      sideLabel: "経過 1分12秒",
    })
    expect(strip.kind === "working" && strip.phases.map((slot) => slot.kind)).toEqual([
      "phase",
      "phase",
    ])
  })
})

describe("useWorkStrip（並列の段）", () => {
  const groupedPlan = (current: number, finishedInGroup: readonly string[]): SessionEvent => ({
    kind: "work-plan",
    delegatedRange: { kind: "none" },
    skippedPhases: [],
    awaitingSummary: { kind: "none" },
    phases: ["架空の段A", ["架空の段B", "架空の段C"]],
    current,
    finishedInGroup,
    phaseSummary: current > 0 || finishedInGroup.length > 0 ? "架空のまとめ。" : "",
  })

  it("並列の段は中の段の丸を1つにまとめ、今の段が2つなら頭の字と位置をつなぐ", () => {
    const state = foldTimed([
      [request, START],
      [groupedPlan(1, []), START + 1_000],
    ])

    const strip = stripAt(state, START + 5_000)

    expect(strip).toMatchObject({
      kind: "working",
      headLabel: "架空の段B・架空の段C",
      sideLabel: "経過 5秒",
    })
    expect(strip.kind === "working" && strip.phases).toMatchObject([
      { kind: "phase", phase: { mark: "✓", state: "done" } },
      {
        kind: "parallel",
        label: "並列 2–3",
        phases: [
          { mark: "2", state: "current" },
          { mark: "3", state: "current" },
        ],
      },
    ])
  })

  it("後ろの段から済ませると、済んだ丸だけが ✓ になり、今の段は残った1つ", () => {
    const state = foldTimed([
      [request, START],
      [groupedPlan(1, []), START + 1_000],
      [groupedPlan(1, ["架空の段C"]), START + 2_000],
    ])

    const strip = stripAt(state, START + 5_000)

    expect(strip).toMatchObject({ headLabel: "架空の段B", sideLabel: "経過 5秒" })
    expect(strip.kind === "working" && strip.phases[1]).toMatchObject({
      phases: [
        { mark: "2", state: "current" },
        { mark: "✓", state: "done" },
      ],
    })
  })

  it("重なって走った段があっても、右端の所要は段の和ではなく依頼の壁時計", () => {
    const state = foldTimed([
      [request, START],
      [groupedPlan(0, []), START + 1_000],
      [groupedPlan(1, []), START + 10_000],
      [groupedPlan(1, ["架空の段C"]), START + 40_000],
      [groupedPlan(2, []), START + 50_000],
      [{ kind: "turn-finished", outcome: { kind: "completed" } }, START + 60_000],
    ])

    expect(stripAt(state, START + 600_000)).toMatchObject({
      kind: "finished",
      headLabel: "3段すべて済み",
      sideLabel: "所要 1分00秒",
    })
  })
})

describe("useWorkStrip（`/clear` の依頼）", () => {
  it("依頼の先頭トークンがちょうど `/clear` なら、2行目は「会話を片付けている」", () => {
    const state = foldTimed([[{ kind: "request", text: "/clear", images: [] }, START]])

    const strip = stripAt(state, START + 5_000)

    expect(strip.kind === "working" && strip.activity.text).toBe("会話を片付けている")
  })

  it("`/clear-foo` のような別名では、2行目は「考えている」のまま", () => {
    const state = foldTimed([[{ kind: "request", text: "/clear-foo", images: [] }, START]])

    const strip = stripAt(state, START + 5_000)

    expect(strip.kind === "working" && strip.activity.text).toBe("考えている")
  })
})

describe("useWorkStrip（読んでいる節）", () => {
  afterEach(() => {
    useReadingSection.setState({ section: { kind: "none" }, outlineCollapsed: false })
  })

  function readingLabelWith(
    section: ReadingSection,
    outlineCollapsed: boolean,
  ): string | undefined {
    useReadingSection.setState({ section, outlineCollapsed })
    const state = foldTimed([[request, START]])
    const strip = stripAt(state, START + 5_000)
    return strip.kind === "none" ? undefined : strip.readingLabel
  }

  it("列を畳んでいて節があれば「いま: <節>」を持つ", () => {
    expect(readingLabelWith({ kind: "shown", text: "変わったこと" }, true)).toBe(
      "いま: 変わったこと",
    )
  })

  it("列が開いていれば出さない", () => {
    expect(readingLabelWith({ kind: "shown", text: "変わったこと" }, false)).toBe("")
  })

  it("節が無ければ出さない", () => {
    expect(readingLabelWith({ kind: "none" }, true)).toBe("")
  })
})

describe("useWorkStrip（ワークプランが届く前）", () => {
  it("送った直後から、段の丸も見出しの字も無い帯を作業中の状態で出す", () => {
    const state = foldTimed([[request, START]])

    const strip = stripAt(state, START + 12_000)

    expect(strip).toMatchObject({
      kind: "working",
      phases: [],
      result: "working",
      headLabel: "",
      sideLabel: "経過 12秒",
    })
  })

  it("本文が1つも無いまま閉じたら、帯ごと消す", () => {
    const state = foldTimed([
      [request, START],
      [{ kind: "turn-finished", outcome: { kind: "completed" } }, START + 5_000],
    ])

    expect(stripAt(state, START + 6_000)).toEqual({ kind: "none" })
  })
})
