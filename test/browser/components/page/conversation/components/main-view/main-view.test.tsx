import { QueryClientProvider } from "@tanstack/react-query"
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
  type RenderResult,
} from "@testing-library/react"
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest"

import { MainView } from "../../../../../../../src/browser/components/page/conversation/components/main-view/main-view.tsx"
import { loadMarkdown } from "../../../../../../../src/browser/components/page/conversation/components/main-view/markdown/deferred-markdown.tsx"
import { useInquiryDraft } from "../../../../../../../src/browser/stores/inquiry-answer.ts"
import {
  INITIAL_SESSION_STATE,
  type SessionRecord,
  type SessionState,
} from "../../../../../../../src/shared/session/session-state.ts"
import {
  detailRecord,
  finishedToolStatus,
  reportRecord,
  requestRecord,
  toolRecord,
  workPlanRecord,
} from "../../../../../../fixture/session-record.ts"
import { typedElement } from "../../../../../../typed-element.ts"
import { createTestQueryClient } from "../../../../../query-client.tsx"
import { putState, putSession } from "../../../../../session-store.ts"

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

/** `turn` を渡すと、そのターンの進み具合で描く（既定は動いていない）。 */
function renderMainView(
  records: readonly SessionRecord[],
  turn: SessionState["turn"] = INITIAL_SESSION_STATE.turn,
): RenderResult {
  // 動いているターンを渡したときは、記録の本文がいまの SDK ターンで届いたものとして扱う
  // （前の SDK ターンで確定した本文は、動いているあいだも出したままになるため）。
  const bodiesInTurn =
    turn.kind === "running" ? { report: true, utterance: true } : INITIAL_SESSION_STATE.bodiesInTurn
  putSession({ ...INITIAL_SESSION_STATE, records, turn, bodiesInTurn })
  // `MainView` は `<RepositoryFileLinkProvider>`（レポートのパスを押せる部品にする一覧の取得）を
  // 内側で mount するので `useQuery` が要る。ここでは一覧の中身を見ないので、フェッチそのものは
  // 差し替えない（`window.fetch` は happy-dom の対象外なので落ちるだけで、テストは待たない）。
  return render(
    <QueryClientProvider client={createTestQueryClient()}>
      <MainView />
    </QueryClientProvider>,
  )
}

/**
 * 札の頭のボタンを押す。選択は hash に乗り、happy-dom は `hashchange` を次のタスクで出すので
 * （本物のブラウザも同期では出さない）、ここで流して読み直させる。
 */
function press(name: string): void {
  act(() => {
    fireEvent.click(screen.getByRole("button", { name }))
    window.dispatchEvent(new Event("hashchange"))
  })
}

function rerenderMainView(records: readonly SessionRecord[]): void {
  act(() => {
    putState({ ...INITIAL_SESSION_STATE, records })
  })
}

const OLDER = "1つ古いターンへ"
const NEWER = "1つ新しいターンへ"
const TO_NEWEST = "最新へ"

function threeTurns(): readonly SessionRecord[] {
  return [
    requestRecord({ text: "1つ目", turnId: 0 }),
    detailRecord("1つ目のレポート"),
    requestRecord({ text: "2つ目", turnId: 1 }),
    detailRecord("2つ目のレポート"),
    requestRecord({ text: "3つ目", turnId: 2 }),
    detailRecord("3つ目のレポート"),
  ]
}

/**
 * 見ているターンのタイトル文字だけ（`⌄` は別要素なので textContent には含まれない。
 * `TurnHeader` の `.turn-title-text`）。
 */
function title(): string | null | undefined {
  return document.querySelector('[class*="turn-title-text"]')?.textContent
}

function position(): string | null | undefined {
  return document.querySelector('[class*="turn-position"]')?.textContent
}

function button(name: string): HTMLButtonElement {
  const found = screen.getByRole("button", { name })
  if (!(found instanceof HTMLButtonElement)) {
    throw new Error(`${name} が button ではない`)
  }
  return found
}

const OUTLINE_PANEL_STORAGE_KEY = "tsukumo-outline-panel:v1"

/** 目次の列を開いたと選んだ状態にする（happy-dom では札の幅が 0 で、選ばなければ畳まれる）。 */
function chooseOutlineOpen(): void {
  localStorage.setItem(OUTLINE_PANEL_STORAGE_KEY, JSON.stringify({ collapse: "open" }))
}

/** 目次の列のやり取りの行（古い順）。 */
function outlineTurnRows(): readonly HTMLButtonElement[] {
  return [...document.querySelectorAll<HTMLButtonElement>("[data-outline-turn]")]
}

/** 目次の列の行（やり取りの行と見出しの行）の字。やり取りの行は印 + 1行目。 */
function outlineRowTexts(): readonly string[] {
  const nav = screen.getByRole("navigation", { name: "目次" })
  return [...nav.querySelectorAll("button")]
    .filter((row) => row.getAttribute("aria-label") !== "目次を畳む")
    .map((row) => row.textContent)
}

describe("MainView（札の頭）", () => {
  it("‹ で1つ古いターンへ、› で1つ新しいターンへ移り、タイトルと n / N が追う", () => {
    renderMainView(threeTurns())

    press(OLDER)
    expect(title()).toBe("2つ目")
    expect(position()).toBe("2 / 3")
    expect(screen.getByText("2つ目のレポート")).toBeDefined()
    expect(screen.queryByText("3つ目のレポート")).toBeNull()

    press(OLDER)
    expect(title()).toBe("1つ目")
    expect(position()).toBe("1 / 3")

    press(NEWER)
    expect(title()).toBe("2つ目")
    expect(position()).toBe("2 / 3")
  })

  it("メインビューの中で [ は1つ古いターンへ、] は1つ新しいターンへ移り、端では動かない", () => {
    renderMainView(threeTurns())
    const root = document.querySelector("[data-main-view]")
    if (root === null) {
      throw new Error("メインビューの根が見つからない")
    }
    const key = (init: KeyboardEventInit): void => {
      act(() => {
        fireEvent.keyDown(root, init)
        window.dispatchEvent(new Event("hashchange"))
      })
    }

    key({ key: "]" })
    expect(position()).toBe("3 / 3")
    key({ key: "[" })
    expect(position()).toBe("2 / 3")
    key({ key: "[", metaKey: true })
    expect(position()).toBe("2 / 3")
    key({ key: "[" })
    key({ key: "[" })
    expect(position()).toBe("1 / 3")
  })

  it("端ではその側を押せない（最新では ›、いちばん古いターンでは ‹）", () => {
    renderMainView(threeTurns())

    // 押せないは `aria-disabled` の1通り（`Button`）。本物の `disabled` にはしないので、
    // フォーカスは残る。
    expect(button(NEWER).getAttribute("aria-disabled")).toBe("true")
    expect(button(NEWER).hasAttribute("disabled")).toBe(false)
    expect(button(OLDER).getAttribute("aria-disabled")).toBe("false")

    press(OLDER)
    press(OLDER)
    expect(button(OLDER).getAttribute("aria-disabled")).toBe("true")
    expect(button(NEWER).getAttribute("aria-disabled")).toBe("false")

    // 端に着いたあとは、フォーカスは残ったまま押しても動かない。
    button(OLDER).focus()
    expect(document.activeElement).toBe(button(OLDER))
    press(OLDER)
    expect(title()).toBe("1つ目")
  })

  it("過去を見ている間は「最新」の印の代わりに「最新へ」が出て、押すと追従に戻る", () => {
    renderMainView(threeTurns())

    press(OLDER)
    press(OLDER)
    expect(screen.queryByText("最新")).toBeNull()

    press(TO_NEWEST)
    expect(title()).toBe("3つ目")
    expect(screen.getByText("最新")).toBeDefined()
    expect(window.location.hash).not.toContain("turn=")

    // 追従に戻ったので、次のターンが始まればそちらへ移る。
    rerenderMainView([
      ...threeTurns(),
      requestRecord({ text: "4つ目", turnId: 3 }),
      detailRecord("4つ目のレポート"),
    ])
    expect(title()).toBe("4つ目")
    expect(position()).toBe("4 / 4")
  })

  it("過去のターンを見ている間は、新しいターンが来ても動かない（n / N の N だけが増える）", () => {
    renderMainView(threeTurns())

    press(OLDER)
    expect(screen.getByText("2つ目のレポート")).toBeDefined()

    rerenderMainView([
      ...threeTurns(),
      requestRecord({ text: "4つ目", turnId: 3 }),
      detailRecord("4つ目のレポート"),
    ])

    expect(title()).toBe("2つ目")
    expect(position()).toBe("2 / 4")
    expect(screen.getByText("2つ目のレポート")).toBeDefined()
    expect(screen.queryByText("4つ目のレポート")).toBeNull()
  })

  it("タイトルは見ているターンの依頼の1行目で、全文は title でも読める", () => {
    renderMainView([
      requestRecord({ text: "架空の依頼の1行目\n2行目", turnId: 0 }),
      detailRecord("本文"),
    ])

    expect(title()).toBe("架空の依頼の1行目")
    expect(document.querySelector('[class*="turn-title-text"]')?.getAttribute("title")).toBe(
      "架空の依頼の1行目",
    )
  })
})

describe("MainView（目次の列: やり取りと見出しの2段）", () => {
  /** 3件目のレポートだけが見出しを2つ持つ。 */
  function threeTurnsWithHeadings(): readonly SessionRecord[] {
    return [
      requestRecord({ text: "1つ目\n2行目は列に出さない", turnId: 0 }),
      detailRecord("1つ目のレポート"),
      requestRecord({ text: "2つ目", turnId: 1 }),
      detailRecord("2つ目のレポート"),
      requestRecord({ text: "3つ目", turnId: 2 }),
      detailRecord("## 節の一\n\n本文の一\n\n### 小節\n\n本文の二\n\n## 節の二\n\n本文の三"),
    ]
  }

  const RUNNING_TURN = { kind: "running", startedAt: 0 } as const satisfies SessionState["turn"]

  afterEach(() => {
    localStorage.removeItem(OUTLINE_PANEL_STORAGE_KEY)
  })

  it("上の段にやり取りが古い順に印と依頼の1行目で並び、見ているやり取りだけが ● でその見出しを子に持つ", () => {
    chooseOutlineOpen()
    renderMainView(threeTurnsWithHeadings())

    expect(outlineRowTexts()).toEqual(["✓1つ目", "✓2つ目", "●3つ目", "節の一", "小節", "節の二"])
    expect(outlineTurnRows().map((row) => row.getAttribute("aria-current"))).toEqual([
      null,
      null,
      "true",
    ])
    expect(outlineTurnRows()[0]?.getAttribute("aria-label")).toBe("済んだ: 1つ目")
  })

  it("働いている最中のいちばん新しいやり取りは「…」の印になる", () => {
    chooseOutlineOpen()
    renderMainView(threeTurnsWithHeadings(), RUNNING_TURN)

    press(OLDER)

    expect(outlineTurnRows()[2]?.getAttribute("aria-label")).toBe("作業中: 3つ目")
    expect(outlineTurnRows()[2]?.textContent).toBe("…3つ目")
  })

  it("やり取りの行を押すとそのやり取りへ移り、見出しの子はそのやり取りのものに替わる", async () => {
    chooseOutlineOpen()
    renderMainView(threeTurnsWithHeadings())

    press("済んだ: 1つ目")

    expect(title()).toBe("1つ目")
    // 見出しは描いた本文の DOM の変化（`MutationObserver`）で拾い直すので、次のタスクで替わる。
    await waitFor(() => {
      expect(outlineRowTexts()).toEqual(["●1つ目", "✓2つ目", "✓3つ目"])
    })
  })

  // Enter で押せることは行が `<button>` であることで確かめる（happy-dom は Enter を click に変えない）。
  it("↑↓ でやり取りの行と見出しの行を区別なく移り、やり取りの行（Enter で押せる button）でそのやり取りへ移る", async () => {
    chooseOutlineOpen()
    renderMainView(threeTurnsWithHeadings())
    const nav = screen.getByRole("navigation", { name: "目次" })
    const [first, second] = outlineTurnRows()
    if (first === undefined || second === undefined) {
      throw new Error("やり取りの行が見つからない")
    }

    act(() => {
      second.focus()
    })
    fireEvent.keyDown(nav, { key: "ArrowDown" })
    expect(document.activeElement?.textContent).toBe("●3つ目")
    fireEvent.keyDown(nav, { key: "ArrowDown" })
    expect(document.activeElement?.textContent).toBe("節の一")
    fireEvent.keyDown(nav, { key: "ArrowUp" })
    fireEvent.keyDown(nav, { key: "ArrowUp" })
    fireEvent.keyDown(nav, { key: "ArrowUp" })
    expect(document.activeElement).toBe(first)
    expect(first.tagName).toBe("BUTTON")

    act(() => {
      fireEvent.click(first)
      window.dispatchEvent(new Event("hashchange"))
    })
    expect(title()).toBe("1つ目")
    await waitFor(() => {
      expect(outlineRowTexts()).toEqual(["●1つ目", "✓2つ目", "✓3つ目"])
    })
  })

  it("やり取りが1件で見出しも2つ未満なら、列ごと出さない", () => {
    chooseOutlineOpen()
    renderMainView([requestRecord({ text: "1つ目", turnId: 0 }), detailRecord("本文")])

    expect(screen.queryByRole("navigation", { name: "目次" })).toBeNull()
  })

  it("札の頭のタイトルは押す口を持たない", () => {
    renderMainView(threeTurns())

    expect(document.querySelector('[class*="turn-title-text"]')?.closest("button")).toBeNull()
  })
})

describe("MainView（依頼の続き）", () => {
  const MORE_BUTTON = /^ほか \d+ 行$/

  it("2行の依頼は、続きが札の頭の中に出て、ボタンは出ない（1行目は二度出さない）", () => {
    renderMainView([
      requestRecord({ text: "架空の依頼の1行目\n1. 起こす", turnId: 0 }),
      detailRecord("本文"),
    ])

    const header = document.querySelector("header")
    expect(header?.textContent).toContain("1. 起こす")
    expect(document.querySelector("details")).toBeNull()
    expect(screen.queryByRole("button", { name: MORE_BUTTON })).toBeNull()
    expect(screen.getAllByText("架空の依頼の1行目")).toHaveLength(1)
  })

  it("別のターンへ移ると、開いた状態は持ち越されない", () => {
    renderMainView([
      requestRecord({ text: "見出し\n続き1\n続き2\n続き3", turnId: 0 }),
      detailRecord("本文"),
      requestRecord({ text: "2つ目\nA\nB\nC", turnId: 1 }),
      detailRecord("2つ目の本文"),
    ])

    press("ほか 1 行")
    press(OLDER)
    press(NEWER)

    expect(screen.queryByRole("button", { name: MORE_BUTTON })).not.toBeNull()
  })
})

describe("MainView（ターン切り替えでレポートの先頭へ戻す）", () => {
  it("前後へ移ると、先頭へ戻す scrollIntoView が1回呼ばれる", () => {
    renderMainView([
      requestRecord({ text: "1つ目", turnId: 0 }),
      detailRecord("1つ目のレポート"),
      requestRecord({ text: "2つ目", turnId: 1 }),
      detailRecord("2つ目のレポート"),
    ])

    const scrollIntoView = vi
      .spyOn(Element.prototype, "scrollIntoView")
      .mockImplementation(() => {})

    press(OLDER)

    expect(scrollIntoView).toHaveBeenCalledTimes(1)
    expect(scrollIntoView.mock.calls[0]?.[0]).toEqual({ block: "start" })

    scrollIntoView.mockRestore()
  })

  it("出ているターンが無いときは呼ばれない", () => {
    const scrollIntoView = vi
      .spyOn(Element.prototype, "scrollIntoView")
      .mockImplementation(() => {})

    renderMainView([])

    expect(scrollIntoView).not.toHaveBeenCalled()

    scrollIntoView.mockRestore()
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
      button(OLDER).focus()
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

  it("中間レポートを挟んで2回答えた質問は、2件とも出た順に残り、畳まれた中間レポートの外に出る", () => {
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
    const folded = document.querySelectorAll("details")
    expect(folded).toHaveLength(1)
    expect(folded[0]?.open).toBe(false)
    expect(folded[0]?.textContent).toContain("架空の中間レポート")
    expect(first.compareDocumentPosition(second) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })
})
