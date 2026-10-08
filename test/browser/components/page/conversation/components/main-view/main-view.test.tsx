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
import { useInquiryJump } from "../../../../../../../src/browser/stores/inquiry-jump.ts"
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

/** `turn` を渡すと、そのターンの進み具合で描く（既定は動いていない）。`pending` は答え待ちの列。 */
function renderMainView(
  records: readonly SessionRecord[],
  turn: SessionState["turn"] = INITIAL_SESSION_STATE.turn,
  pending: SessionState["pending"] = INITIAL_SESSION_STATE.pending,
): RenderResult {
  // 動いているターンを渡したときは、記録の本文がいまの SDK ターンで届いたものとして扱う
  // （前の SDK ターンで確定した本文は、動いているあいだも出したままになるため）。
  const bodiesInTurn =
    turn.kind === "running" ? { report: true, utterance: true } : INITIAL_SESSION_STATE.bodiesInTurn
  putSession({ ...INITIAL_SESSION_STATE, records, turn, bodiesInTurn, pending })
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
 * 名前でボタンを押す。選択は hash に乗り、happy-dom は `hashchange` を次のタスクで出すので
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

/**
 * メインビューの根で `[`（1つ古い）か `]`（1つ新しい）を押す。
 * 選択は hash に乗るので、`press` と同じく `hashchange` を流す。
 */
function stepTurn(key: "[" | "]", init: KeyboardEventInit = {}): void {
  const root = document.querySelector("[data-main-view]")
  if (root === null) {
    throw new Error("メインビューの根が見つからない")
  }
  act(() => {
    fireEvent.keyDown(root, { key, ...init })
    window.dispatchEvent(new Event("hashchange"))
  })
}

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

/** 見ているターンの依頼の1行目（依頼の塊の最初の行）。 */
function title(): string | null | undefined {
  return screen
    .getByRole("heading", { level: 2, name: "依頼" })
    .closest("section")
    ?.querySelector("p > span")?.textContent
}

function button(name: string): HTMLButtonElement {
  const found = screen.getByRole("button", { name })
  if (!(found instanceof HTMLButtonElement)) {
    throw new Error(`${name} が button ではない`)
  }
  return found
}

const OUTLINE_PANEL_STORAGE_KEY = "tsukumo-outline-panel:v1"

/** やり取りの列を開いたと選んだ状態にする（happy-dom では札の幅が 0 で、選ばなければ畳まれる）。 */
function chooseOutlineOpen(): void {
  localStorage.setItem(OUTLINE_PANEL_STORAGE_KEY, JSON.stringify({ collapse: "open" }))
}

/** やり取りの列のやり取りの行（古い順）。 */
function outlineTurnRows(): readonly HTMLButtonElement[] {
  return [...document.querySelectorAll<HTMLButtonElement>("[data-outline-turn]")]
}

/** やり取りの列の行（やり取りの行と見出しの行）の字。やり取りの行は印 + 1行目。 */
function outlineRowTexts(): readonly string[] {
  const nav = screen.getByRole("navigation", { name: "やり取り" })
  return [...nav.querySelectorAll("button")]
    .filter((row) => row.getAttribute("aria-label") !== "やり取りを畳む")
    .map((row) => row.textContent)
}

describe("MainView（やり取りの移動）", () => {
  afterEach(() => {
    localStorage.removeItem(OUTLINE_PANEL_STORAGE_KEY)
  })

  /** 答え待ちが届いたまま動いている、いちばん新しいやり取り。 */
  const ASKING_TURN = { kind: "running", startedAt: 0 } as const satisfies SessionState["turn"]
  const PERMISSION = [
    { kind: "permission", id: "fake-ask", toolName: "Bash", input: {}, askedAt: 0 },
  ] as const satisfies SessionState["pending"]

  it("題の行（前後の口と n / N）は出ない", () => {
    renderMainView(threeTurns())

    expect(screen.queryByRole("button", { name: "1つ古いターンへ" })).toBeNull()
    expect(screen.queryByRole("button", { name: "最新へ" })).toBeNull()
    expect(document.querySelector('[class*="turn-position"]')).toBeNull()
  })

  it("メインビューの中で [ は1つ古いターンへ、] は1つ新しいターンへ移り、端と修飾キーつきでは動かない", () => {
    renderMainView(threeTurns())

    stepTurn("]")
    expect(title()).toBe("3つ目")
    stepTurn("[")
    expect(title()).toBe("2つ目")
    expect(screen.getByText("2つ目のレポート")).toBeDefined()
    expect(screen.queryByText("3つ目のレポート")).toBeNull()
    stepTurn("[", { metaKey: true })
    expect(title()).toBe("2つ目")
    stepTurn("[")
    stepTurn("[")
    expect(title()).toBe("1つ目")
    stepTurn("]")
    expect(title()).toBe("2つ目")
  })

  it("過去を見ているときに最新のやり取りの行を押すと、追従に戻る", () => {
    chooseOutlineOpen()
    renderMainView(threeTurns())

    press("完了: 1つ目")
    expect(title()).toBe("1つ目")

    press("完了: 3つ目")
    expect(title()).toBe("3つ目")
    expect(window.location.hash).not.toContain("turn=")
  })

  it("過去のターンを見ている間は、新しいターンが来ても動かない", () => {
    renderMainView(threeTurns())

    stepTurn("[")
    expect(screen.getByText("2つ目のレポート")).toBeDefined()

    rerenderMainView([
      ...threeTurns(),
      requestRecord({ text: "4つ目", turnId: 3 }),
      detailRecord("4つ目のレポート"),
    ])

    expect(title()).toBe("2つ目")
    expect(screen.getByText("2つ目のレポート")).toBeDefined()
    expect(screen.queryByText("4つ目のレポート")).toBeNull()
  })

  it("最新が答え待ちのとき過去を見ると、列の頭に「お伺いが届いた」の行が出て、押すと最新へ移りお伺いへの転がしを頼む", () => {
    chooseOutlineOpen()
    renderMainView(threeTurns(), ASKING_TURN, PERMISSION)
    expect(screen.queryByRole("button", { name: "お伺いが届いた" })).toBeNull()

    stepTurn("[")
    const signal = useInquiryJump.getState().jump.signal
    press("お伺いが届いた")

    expect(title()).toBe("3つ目")
    expect(useInquiryJump.getState().jump).toEqual({ signal: signal + 1, focus: false })
    expect(screen.queryByRole("button", { name: "お伺いが届いた" })).toBeNull()
  })

  it("最新が作業中のとき過去を見ると「作業中」の行が出て、押すと最新へ移るだけ", () => {
    chooseOutlineOpen()
    renderMainView(threeTurns(), ASKING_TURN)

    stepTurn("[")
    const signal = useInquiryJump.getState().jump.signal
    press("作業中")

    expect(title()).toBe("3つ目")
    expect(useInquiryJump.getState().jump.signal).toBe(signal)
  })

  it("畳んだ列では知らせが印だけの口になり、押すと同じく最新へ移る", () => {
    renderMainView(threeTurns(), ASKING_TURN, PERMISSION)

    stepTurn("[")
    const mark = button("お伺いが届いた")
    expect(mark.textContent).toBe("!")
    expect(mark.getAttribute("title")).toBe("お伺いが届いた")

    press("お伺いが届いた")
    expect(title()).toBe("3つ目")
  })
})

describe("MainView（やり取りの列: やり取りと見出しの2段）", () => {
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
    expect(outlineTurnRows()[0]?.getAttribute("aria-label")).toBe("完了: 1つ目")
  })

  it("働いている最中のいちばん新しいやり取りは「…」の印になる", () => {
    chooseOutlineOpen()
    renderMainView(threeTurnsWithHeadings(), RUNNING_TURN)

    stepTurn("[")

    expect(outlineTurnRows()[2]?.getAttribute("aria-label")).toBe("作業中: 3つ目")
    expect(outlineTurnRows()[2]?.textContent).toBe("…3つ目")
  })

  it("やり取りの行を押すとそのやり取りへ移り、見出しの子はそのやり取りのものに替わる", async () => {
    chooseOutlineOpen()
    renderMainView(threeTurnsWithHeadings())

    press("完了: 1つ目")

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
    const nav = screen.getByRole("navigation", { name: "やり取り" })
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

  it("やり取りが1件で見出しも無くても、列は出る", () => {
    chooseOutlineOpen()
    renderMainView([requestRecord({ text: "1つ目", turnId: 0 }), detailRecord("本文")])

    expect(screen.getByRole("navigation", { name: "やり取り" })).toBeTruthy()
  })

  it("畳んだ列の開き直す口を押すと、やり取りの行が出る", () => {
    renderMainView(threeTurns())

    expect(outlineTurnRows()).toHaveLength(0)
    fireEvent.click(screen.getByRole("button", { name: "やり取りを開く" }))
    expect(outlineTurnRows()).toHaveLength(3)
  })
})

describe("MainView（依頼の塊）", () => {
  const MORE_BUTTON = /^続き \d+ 行$/

  function requestBlockText(): string | null | undefined {
    return screen.getByRole("heading", { level: 2, name: "依頼" }).closest("section")?.textContent
  }

  it("2行の依頼は、塊に2行とも出て、開く口は出ない", () => {
    renderMainView([
      requestRecord({ text: "架空の依頼の1行目\n1. 起こす", turnId: 0 }),
      detailRecord("本文"),
    ])

    expect(requestBlockText()).toContain("架空の依頼の1行目")
    expect(requestBlockText()).toContain("1. 起こす")
    expect(screen.queryByRole("button", { name: MORE_BUTTON })).toBeNull()
  })

  it("別のターンへ移ると、開いた状態は持ち越されない", () => {
    renderMainView([
      requestRecord({ text: "見出し\n続き1\n続き2\n続き3\n続き4", turnId: 0 }),
      detailRecord("本文"),
      requestRecord({ text: "2つ目\nA\nB\nC\nD", turnId: 1 }),
      detailRecord("2つ目の本文"),
    ])

    press("続き 1 行")
    stepTurn("[")
    stepTurn("]")

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

    stepTurn("[")

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
