import { act, cleanup, screen } from "@testing-library/react"
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"

import { useInquiryDraft } from "../../../../../../../src/browser/components/page/conversation/stores/inquiry-draft.ts"
import { loadMarkdown } from "../../../../../../../src/browser/features/report/markdown.tsx"
import type {
  LeafComponent,
  ReportSection,
} from "../../../../../../../src/shared/report/report-block.ts"
import type { SessionRecord } from "../../../../../../../src/shared/session/session-record.ts"
import {
  INITIAL_SESSION_STATE,
  type SessionState,
} from "../../../../../../../src/shared/session/session-state.ts"
import {
  press,
  renderMainView,
  renderMainViewBeforeHello,
  rerenderMainView,
  stepTurn,
} from "../../../../../../fixture/main-view.tsx"
import { componentsOfSections } from "../../../../../../fixture/report-event.ts"
import {
  asideRecord,
  detailRecord,
  reportRecord,
  requestRecord,
  speechRecord,
  toolRecord,
  workPlanRecord,
} from "../../../../../../fixture/session-record.ts"
import { typedElement } from "../../../../../../typed-element.ts"
import { stubPhoneWidth } from "../../../../../phone-width.ts"
import { putState } from "../../../../../session-store.ts"

beforeAll(async () => {
  await loadMarkdown()
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
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

describe("MainView（hello の前）", () => {
  it("hello が届くまでは始め方の一覧を描かず、届くと描く", () => {
    renderMainViewBeforeHello()
    expect(screen.queryByText("何から始める？")).toBeNull()

    rerenderMainView([])
    expect(screen.getByText("何から始める？")).toBeDefined()
  })
})

describe("MainView（依頼の全文）", () => {
  function requestBlockText(): string | null | undefined {
    return screen.getByRole("heading", { level: 2, name: "依頼" }).closest("section")?.textContent
  }

  // jsdom は寸法を測れないので、地の文が2行に収まらず切れていることにする。
  beforeEach(() => {
    vi.spyOn(HTMLElement.prototype, "scrollHeight", "get").mockReturnValue(100)
  })
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("地の文が切れている依頼は、開くボタン「全文」で開いて「畳む」で戻る", () => {
    renderMainView([
      requestRecord({ text: "架空の依頼の1行目\n1. 起こす", turnId: 0 }),
      detailRecord("本文"),
    ])

    expect(requestBlockText()).toContain("架空の依頼の1行目")
    expect(screen.getByRole("button", { name: "全文" }).getAttribute("aria-expanded")).toBe("false")

    press("全文")
    expect(requestBlockText()).toContain("1. 起こす")
    expect(screen.getByRole("button", { name: "畳む" }).getAttribute("aria-expanded")).toBe("true")
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
  it("上限を超えて古いステップが落ちても、閉じた <details> が別のステップに化けない", () => {
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

    // 真ん中あたり（i=15）を利用者が閉じたことにする（既定は開いている）。
    // 直接プロパティを下ろして「閉じた」を再現する。
    const target = findBySummary("見出し15")
    target.open = false
    expect(target.open).toBe(false)

    // 別の1件（i=16、触っていない）も、化けていないかの対照として控えておく。
    const untouchedText = "見出し16"
    expect(findBySummary(untouchedText).open).toBe(true)

    // 記録がさらに積まれ（46件）、前のほうがもう1件古いほうから落ちる
    // （i=15 自体はまだ残る範囲）。
    rerenderMainView(buildRecords(46))

    // id を key にしていれば、i=15 の <details> は同じ DOM ノードのまま残り、
    // 閉じた状態も中身もそのまま。添字を key にすると、ステップが1つ前へ
    // ずれた分だけ別のステップの中身にこの閉じた枠が使い回されてしまう。
    const targetAfter = findBySummary("見出し15")
    expect(targetAfter.open).toBe(false)
    expect(targetAfter).toBe(target)

    // 触っていない別の1件も、化けて閉じたままにならない。
    expect(findBySummary(untouchedText).open).toBe(true)
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

  /** 入れ替わる中身の器の中にある、フォーカスできる要素。 */
  function focusableInFrame(): HTMLElement {
    const found = document.querySelector<HTMLElement>("[data-main-view-content] button")
    if (found === null) {
      throw new Error("中身の器の中にフォーカスできるボタンが無い")
    }
    return found
  }

  it("閉じた瞬間にレポートへ入れ替わっても器は作り直さず、残る要素のフォーカスはそのまま", () => {
    renderRunning()
    const frame = document.querySelector("[data-main-view-content]")
    act(() => {
      focusableInFrame().focus()
    })
    const focused = document.activeElement
    close()

    expect(shownContent()).toBe("report")
    expect(screen.getByText("届いた結論")).toBeDefined()
    expect(screen.queryByRole("button", { name: "レポートが届いた" })).toBeNull()
    expect(document.querySelector("[data-main-view-content]")).toBe(frame)
    expect(document.activeElement).toBe(focused)
  })

  /** 器の中に置いた要素にフォーカスしてから、その要素を外す（閉じた瞬間に消える要素の代わり）。 */
  function focusThenRemoveInFrame(): void {
    const frame = document.querySelector("[data-main-view-content]")
    if (frame === null) {
      throw new Error("中身の器が無い")
    }
    const vanishing = document.createElement("button")
    frame.append(vanishing)
    act(() => {
      vanishing.focus()
    })
    vanishing.remove()
  }

  it("器の中でフォーカスのあった要素が消えたまま閉じると、フォーカスはメインビューの根へ移る", () => {
    renderRunning()
    focusThenRemoveInFrame()
    expect(document.activeElement).toBe(document.body)
    close()

    expect(shownContent()).toBe("report")
    expect(document.activeElement).toBe(
      document.querySelector("[data-main-view-content]")?.parentElement,
    )
  })

  it("器の中の要素が消えたあと器の外へフォーカスを移していれば、閉じてもそこから動かさない", () => {
    renderRunning()
    focusThenRemoveInFrame()
    const outside = document.createElement("input")
    document.body.append(outside)
    act(() => {
      outside.focus()
    })
    close()

    expect(shownContent()).toBe("report")
    expect(document.activeElement).toBe(outside)
    outside.remove()
  })

  it("中身の種類が変わらない更新では、中にあるフォーカスをメインビューの根へ移さない", () => {
    renderRunning()
    act(() => {
      focusableInFrame().focus()
    })
    const focused = document.activeElement

    act(() => {
      putState({
        ...INITIAL_SESSION_STATE,
        records: [
          requestRecord({ text: "架空の依頼", turnId: 0 }),
          requestRecord({ text: "続きの依頼", turnId: 1 }),
        ],
        turn: RUNNING,
      })
    })

    expect(shownContent()).toBe("work")
    expect(document.activeElement).toBe(focused)
  })

  it("中にフォーカスが無ければ、閉じてもメインビューへフォーカスを持ち込まない", () => {
    renderRunning()
    close()

    expect(shownContent()).toBe("report")
    expect(document.activeElement).toBe(document.body)
  })
})

describe("MainView（狭い画面の「いまの段」）", () => {
  const RUNNING_RECORDS = [
    requestRecord({ text: "架空の依頼", turnId: 0 }),
    workPlanRecord({ phases: ["架空の段A", "架空の段B"], current: 0 }),
  ]
  const RUNNING_TURN = { kind: "running", startedAt: 0 } as const

  it("広い画面では描かない", () => {
    stubPhoneWidth(false)

    renderMainView(RUNNING_RECORDS, RUNNING_TURN)

    expect(screen.queryByRole("heading", { name: /^いまのフェーズ/u })).toBeNull()
  })

  it("狭い画面では描く", () => {
    stubPhoneWidth(true)

    renderMainView(RUNNING_RECORDS, RUNNING_TURN)

    expect(screen.getByRole("heading", { name: /^いまのフェーズ/u })).toBeTruthy()
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
      answers: [{ kind: "chosen", labels: ["案A"] }],
      briefs: [],
      imageSizes: [],
      unshelvedImages: [],
    }
  }

  it("中間レポートを挟んで2回答えた質問は、2件とも中間レポートと届いた順に経過の畳みの中へ入る", () => {
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
    const folds = document.querySelectorAll(".progress-fold")
    expect(folds).toHaveLength(1)
    expect(folds[0]?.contains(first)).toBe(true)
    expect(folds[0]?.contains(second)).toBe(true)
    expect(folds[0]?.textContent).toContain("架空の中間レポート")
    expect(folds[0]).toHaveProperty("open", false)
    expect(
      [...(folds[0]?.querySelectorAll("details") ?? [])].every((details) => details.open),
    ).toBe(true)
    expect(first.compareDocumentPosition(second) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })
})

describe("MainView（プログレスバーのいまの手順の一文）", () => {
  const RECORDS = [
    requestRecord({ text: "架空の依頼", turnId: 0 }),
    workPlanRecord({ phases: ["架空の段A", "架空の段B"], current: 0 }),
    speechRecord({ text: "架空の一言目" }),
  ]

  it("作業中は、走っている手順の文が進み具合の区画の中に1つある", () => {
    stubPhoneWidth(false)

    renderMainView(
      [...RECORDS, toolRecord({ name: "Bash", input: { command: "架空のコマンド" } })],
      { kind: "running", startedAt: 0 },
    )

    const sentences = document.querySelectorAll("[data-work-strip] [data-work-strip-now]")
    expect(sentences).toHaveLength(1)
    expect(sentences[0]?.textContent).toContain("架空のコマンド")
    expect(sentences[0]?.textContent).not.toContain("走らせています")
  })

  it("狭い画面では一文を出さない", () => {
    stubPhoneWidth(true)

    renderMainView(RECORDS, { kind: "running", startedAt: 0 })

    expect(document.querySelector("[data-work-strip-now]")).toBeNull()
  })

  it("閉じたあとは出さない", () => {
    stubPhoneWidth(false)

    renderMainView([...RECORDS, reportRecord("架空の結論")])

    expect(document.querySelector("[data-work-strip-now]")).toBeNull()
  })
})

describe("MainView（会話の流れ）", () => {
  it("依頼・補足は右寄せの投稿、セリフと補足への答えは左寄せの行で、記録の順に1本で出る", () => {
    renderMainView([
      requestRecord({ text: "架空の依頼", turnId: 0 }),
      speechRecord({ text: "架空の一言目" }),
      asideRecord({ text: "架空の補足" }),
      speechRecord({ text: "架空の答え", answersAside: true }),
    ])

    const speakers = [...document.querySelectorAll("[data-speaker]")].map((element) => [
      element.getAttribute("data-speaker"),
      element.textContent,
    ])
    expect(speakers).toEqual([
      ["user", "あなた依頼架空の依頼"],
      ["character", "キャラクター架空の一言目"],
      ["user", "あなた架空の補足"],
      ["character", "キャラクター架空の答え"],
    ])
  })

  it("畳むものが無ければ作業の経過は出さず、依頼のあとに最終レポートが続く。最終レポートより前のセリフは畳みに入る", () => {
    renderMainView([requestRecord({ text: "架空の依頼", turnId: 0 }), reportRecord("架空の結論")])

    expect(screen.queryByText(/作業の経過/)).toBeNull()
    expect(screen.getByText("架空の結論")).toBeTruthy()
  })
})

describe("MainView（レポートを欄ごとに描く）", () => {
  const textBlock = (text: string): LeafComponent => ({ kind: "text", text, fold: "", aside: "" })
  const regionedReport = (conclusion: string, firstBlock: LeafComponent): SessionRecord => {
    const base = reportRecord(conclusion)
    if (base.kind !== "report") {
      throw new Error("report の記録ではない")
    }
    const sections: readonly ReportSection[] = [
      { heading: "架空の節A", blocks: [firstBlock] },
      { heading: "架空の節B", blocks: [textBlock("架空の本文B。")] },
    ]
    return {
      ...base,
      components: componentsOfSections(
        sections,
        { kind: "none", reason: "unrecorded" },
        { kind: "none" },
      ),
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
    [...reportBody().children]
      .filter((child) => !child.hasAttribute("data-first-note"))
      .map(
        (child) =>
          child.getAttribute("data-report-section") ??
          child.getAttribute("data-report-region") ??
          "",
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

  it("セクションの逃げ道の部品に閉じない <details> があっても、次のセクションは畳みの中に入らない", () => {
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
