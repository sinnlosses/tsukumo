import { act, cleanup, fireEvent, screen, within } from "@testing-library/react"
import { afterEach, beforeAll, describe, expect, it } from "vitest"

import { loadMarkdown } from "../../../../../../../src/browser/components/page/conversation/components/markdown/markdown.tsx"
import { useInquiryDraft } from "../../../../../../../src/browser/stores/inquiry-answer.ts"
import type { ReportBlock } from "../../../../../../../src/shared/report/report-block.ts"
import type { SessionRecord } from "../../../../../../../src/shared/session/session-record.ts"
import {
  INITIAL_SESSION_STATE,
  type SessionState,
} from "../../../../../../../src/shared/session/session-state.ts"
import {
  press,
  renderMainView,
  rerenderMainView,
  stepTurn,
} from "../../../../../../fixture/main-view.tsx"
import {
  detailRecord,
  finishedToolStatus,
  reportRecord,
  requestRecord,
  toolRecord,
  workPlanRecord,
} from "../../../../../../fixture/session-record.ts"
import { typedElement } from "../../../../../../typed-element.ts"
import { putState } from "../../../../../session-store.ts"

beforeAll(async () => {
  await loadMarkdown()
})

afterEach(() => {
  cleanup()
  // 組み立て中の答えはモジュール単位で残るので、次のテストへ持ち越さない。
  useInquiryDraft.setState(useInquiryDraft.getInitialState(), true)
  // 過去のターンを選ぶと hash に乗る（`useTurnSelection`）ので、次のテストへ持ち越さない。
  window.location.hash = ""
})

function tool(
  overrides: Partial<Extract<SessionRecord, { readonly kind: "tool" }>>,
): SessionRecord {
  return {
    kind: "tool",
    toolUseId: "fake-tool",
    name: "Read",
    input: {},
    nested: false,
    startedAt: { kind: "stamped", at: 0 },
    status: {
      kind: "finished",
      finishedAt: { kind: "stamped", at: 0 },
      result: { kind: "succeeded" },
    },
    backgroundEnd: { kind: "foreground" },
    ...overrides,
  }
}

function button(name: string): HTMLButtonElement {
  const found = screen.getByRole("button", { name })
  if (!(found instanceof HTMLButtonElement)) {
    throw new Error(`${name} が button ではない`)
  }
  return found
}

describe("MainView（依頼の全文）", () => {
  function requestBlockText(): string | null | undefined {
    return screen.getByRole("heading", { level: 2, name: "依頼" }).closest("section")?.textContent
  }

  it("2行の依頼は、塊に1行目だけ出て、開く口「全文」で全行が出る", () => {
    renderMainView([
      requestRecord({ text: "架空の依頼の1行目\n1. 起こす", turnId: 0 }),
      detailRecord("本文"),
    ])

    expect(requestBlockText()).toContain("架空の依頼の1行目")
    expect(requestBlockText()).not.toContain("1. 起こす")

    press("全文")
    expect(requestBlockText()).toContain("1. 起こす")
  })

  it("別のターンへ移ると、開いた状態は持ち越されない", () => {
    renderMainView([
      requestRecord({ text: "見出し\n続き1", turnId: 0 }),
      detailRecord("本文"),
      requestRecord({ text: "2つ目\nA", turnId: 1 }),
      detailRecord("2つ目の本文"),
    ])

    press("全文")
    stepTurn("[")
    stepTurn("]")

    expect(screen.queryByRole("button", { name: "全文" })).not.toBeNull()
  })
})

describe("MainView（中間レポート）", () => {
  it("上限を超えて古いステップが落ちても、開いた <details> が別のステップに化けない", () => {
    // 十分な数の中間レポート（それぞれ report + tool の対）を積み、1つのやり取りが画面に出す
    // 記録の上限（40。ツールの実行は数えないので、数えるのはレポートの件数）を超えさせる。
    // 全部のあとに非中間の締めの report を置くので、手前は全部 superseded = true になり
    // <details> で畳まれる。
    const pair = (index: number): SessionRecord[] => [
      reportRecord(`## 見出し${String(index)}\n\n- 発見A\n- 発見B`),
      tool({ toolUseId: `t${String(index)}`, name: "Write", input: { file_path: "src/a.ts" } }),
    ]

    const buildRecords = (pairCount: number): SessionRecord[] => [
      requestRecord({ text: "依頼", turnId: 0 }),
      ...Array.from({ length: pairCount }, (_, index) => pair(index)).flat(),
      reportRecord("できたよ"),
    ]

    // 45件（i=0..44）: レポート45件＋締めの1件が上限（40）を超えるので、前のほうは落ちる。
    const result = renderMainView(buildRecords(45))

    // 落ちていること自体をここで確かめておく（落ちなくなるとこのテストは何も試さなくなる）。
    expect(result.container.querySelector(".turn-dropped")).not.toBeNull()

    const findBySummary = (text: string): HTMLDetailsElement => {
      const details = [...result.container.querySelectorAll(".main-step.is-interim")].find(
        (node) => node.querySelector("summary")?.textContent === text,
      )
      return typedElement(details, HTMLDetailsElement, `summary "${text}" を持つ <details>`)
    }

    // 真ん中あたり（i=15）を利用者が開いたことにする。<details> の open はReactが制御しない
    // ネイティブの状態なので、直接プロパティを立てて「開いた」を再現する。
    const target = findBySummary("中間レポート: 見出し15")
    target.open = true
    expect(target.open).toBe(true)

    // 別の1件（i=16、まだ開いていない）も、化けていないかの対照として控えておく。
    const untouchedText = "中間レポート: 見出し16"
    expect(findBySummary(untouchedText).open).toBe(false)

    // 記録がさらに積まれ（46件）、前のほうがもう1件古いほうから落ちる
    // （i=15 自体はまだ残る範囲）。
    rerenderMainView(buildRecords(46))

    // id を key にしていれば、i=15 の <details> は同じ DOM ノードのまま残り、
    // 開いた状態も中身もそのまま。添字を key にしていた旧実装では、ステップが1つ前へ
    // ずれた分だけ別のステップの中身にこの open な枠が使い回されてしまう。
    const targetAfter = findBySummary("中間レポート: 見出し15")
    expect(targetAfter.open).toBe(true)
    expect(targetAfter).toBe(target)

    // 触っていない別の1件も、化けて開いたままにならない。
    expect(findBySummary(untouchedText).open).toBe(false)
  })
})

describe("MainView（閉じたときの入れ替えとフォーカス）", () => {
  const RUNNING = { kind: "running", startedAt: 0 } as const satisfies SessionState["turn"]
  const ENDED = {
    kind: "finished",
    startedAt: 0,
    finishedAt: 100,
    ending: { kind: "ended" },
  } as const satisfies SessionState["turn"]

  /** 依頼を送って動いている姿から描く。 */
  function renderRunning(): void {
    renderMainView([requestRecord({ text: "架空の依頼", turnId: 0 })], RUNNING)
  }

  /** 同じやり取りを `report` つきで閉じる。 */
  function close(): void {
    act(() => {
      putState({
        ...INITIAL_SESSION_STATE,
        records: [requestRecord({ text: "架空の依頼", turnId: 0 }), reportRecord("届いた結論")],
        turn: ENDED,
      })
    })
  }

  function shownContent(): string | null | undefined {
    return document
      .querySelector("[data-main-view-content]")
      ?.getAttribute("data-main-view-content")
  }

  it("中にフォーカスがあっても、閉じた瞬間にレポートへ入れ替わり、フォーカスはメインビューの根に残る", () => {
    renderRunning()
    act(() => {
      button("やり取りを開く").focus()
    })
    close()

    expect(shownContent()).toBe("report")
    expect(screen.getByText("届いた結論")).toBeDefined()
    expect(screen.queryByRole("button", { name: "レポートが届いた" })).toBeNull()
    expect(document.activeElement?.hasAttribute("data-main-view")).toBe(true)
  })

  it("中にフォーカスが無ければ、閉じてもメインビューへフォーカスを持ち込まない", () => {
    renderRunning()
    close()

    expect(shownContent()).toBe("report")
    expect(document.activeElement).toBe(document.body)
  })
})

describe("MainView（失敗の塊から帯の手順へ）", () => {
  it("失敗した手順を見る口を押すと、帯の手順の一覧が開き、失敗の行が1つ出る", () => {
    renderMainView(
      [
        requestRecord({ text: "架空の依頼", turnId: 0 }),
        workPlanRecord({ phases: ["架空の段A", "架空の段B"], current: 0 }),
        toolRecord({
          toolUseId: "fake-ok",
          status: finishedToolStatus(),
        }),
        toolRecord({
          toolUseId: "fake-failed",
          status: finishedToolStatus({
            result: { kind: "failed", output: { head: "架空のエラー出力", omittedLength: 0 } },
          }),
        }),
        { kind: "turn-failure", failure: { kind: "execution-error" } },
      ],
      {
        kind: "finished",
        startedAt: 0,
        finishedAt: 100,
        ending: { kind: "failed", failure: { kind: "execution-error" } },
      },
    )
    expect(screen.queryByRole("region", { name: "依頼の手順" })).toBeNull()

    const block = screen.getByRole("note", { name: "失敗で終わった" })
    act(() => {
      fireEvent.click(within(block).getByRole("button", { name: "失敗した手順を見る" }))
    })

    const steps = screen.getByRole("region", { name: "依頼の手順" })
    expect(steps.querySelectorAll("[data-step-failed]")).toHaveLength(1)
  })
})

describe("MainView（答えた質問の記録）", () => {
  function answered(toolUseId: string, text: string): SessionRecord {
    return {
      kind: "question",
      toolUseId,
      questions: [
        {
          header: "確認",
          text,
          multiSelect: false,
          options: [
            { label: "案A", description: "", preview: undefined },
            { label: "案B", description: "", preview: undefined },
          ],
        },
      ],
      answers: [["案A"]],
    }
  }

  it("中間レポートを挟んで2回答えた質問は、2件とも出た順に残り、経過の畳みの外に出る", () => {
    renderMainView([
      requestRecord({ text: "架空の依頼", turnId: 0 }),
      answered("fake-ask-1", "架空の質問1：どちらを先に見る？"),
      reportRecord("架空の中間レポート"),
      tool({ toolUseId: "fake-write", name: "Write", input: { file_path: "src/a.ts" } }),
      answered("fake-ask-2", "架空の質問2：このまま閉じてよい？"),
      reportRecord("架空の結論"),
    ])

    const first = screen.getByRole("heading", { name: /架空の質問1/ })
    const second = screen.getByRole("heading", { name: /架空の質問2/ })
    expect(first.closest("details")).toBeNull()
    expect(second.closest("details")).toBeNull()
    const folds = document.querySelectorAll(".progress-fold")
    expect(folds).toHaveLength(1)
    expect(folds[0]?.textContent).toContain("架空の中間レポート")
    expect([...document.querySelectorAll("details")].every((details) => !details.open)).toBe(true)
    expect(first.compareDocumentPosition(second) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })
})

describe("MainView（レポートを欄ごとに描く）", () => {
  const textBlock = (text: string): ReportBlock => ({ kind: "text", text, fold: "", aside: "" })
  const regionedReport = (conclusion: string, firstBlock: ReportBlock): SessionRecord => {
    const base = reportRecord(conclusion)
    if (base.kind !== "report") {
      throw new Error("report の記録ではない")
    }
    return {
      ...base,
      sections: [
        { heading: "架空の節A", shapeTag: "unspecified", blocks: [firstBlock] },
        { heading: "架空の節B", shapeTag: "unspecified", blocks: [textBlock("架空の本文B。")] },
      ],
      favor: "架空のお願い",
    }
  }
  const reportBody = (): HTMLElement => {
    const body = document.querySelector("[data-report-body]")
    if (!(body instanceof HTMLElement)) {
      throw new Error("レポートの本文が見つからない")
    }
    return body
  }
  const regionsOfBody = (): readonly string[] =>
    [...reportBody().children].map(
      (child) =>
        child.getAttribute("data-report-section") ?? child.getAttribute("data-report-region") ?? "",
    )

  it("結論に閉じない <div> があっても、節とお願いの欄は結論の入れ物に呑まれない", () => {
    renderMainView([
      requestRecord({ text: "架空の依頼", turnId: 0 }),
      regionedReport("<div>架空の結論", textBlock("架空の本文A。")),
    ])

    expect(regionsOfBody()).toEqual(["head", "0", "1", "favor"])
    expect(reportBody().querySelector('[data-report-region="head"] h4')).toBeNull()
    expect(reportBody().querySelector('[data-report-section="1"] h4')?.textContent).toBe(
      "架空の節B",
    )
  })

  it("節の逃げ道の塊に閉じない <details> があっても、次の節は畳みの中に入らない", () => {
    renderMainView([
      requestRecord({ text: "架空の依頼", turnId: 0 }),
      regionedReport("架空の結論", {
        kind: "markdown",
        markdown: "<details><summary>架空の畳み</summary>\n\n架空の脇道。",
        fold: "",
        aside: "",
      }),
    ])

    const heading = reportBody().querySelector('[data-report-section="1"] h4')
    expect(regionsOfBody()).toEqual(["head", "0", "1", "favor"])
    expect(heading?.textContent).toBe("架空の節B")
    expect(heading?.closest("details")).toBeNull()
  })
})
