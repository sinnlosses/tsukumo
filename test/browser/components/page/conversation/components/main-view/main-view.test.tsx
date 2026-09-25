import { afterEach, describe, expect, it, spyOn } from "bun:test"

import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { act, cleanup, fireEvent, render, screen, type RenderResult } from "@testing-library/react"

import { MainView } from "../../../../../../../src/browser/components/page/conversation/components/main-view/main-view.tsx"
import { QuestionRecord } from "../../../../../../../src/browser/components/page/conversation/components/main-view/question-record.tsx"
import { BRUSH_ORIGIN_ATTRIBUTE } from "../../../../../../../src/browser/domain/reveal/brush-tip.ts"
import { QuestionAnswerProvider } from "../../../../../../../src/browser/stores/question-answer.tsx"
import { QuestionScrollProvider } from "../../../../../../../src/browser/stores/question-scroll.tsx"
import {
  type SessionStore,
  SessionStoreContext,
} from "../../../../../../../src/browser/stores/session.tsx"
import { TurnSelectionProvider } from "../../../../../../../src/browser/stores/turn-selection.tsx"
import { type MainViewQuestion } from "../../../../../../../src/shared/main-view.ts"
import {
  INITIAL_SESSION_STATE,
  type SessionRecord,
  type SessionState,
} from "../../../../../../../src/shared/session-state.ts"
import {
  detailRecord,
  reportRecord,
  requestRecord,
  speechRecord,
} from "../../../../../../fixture/session-record.ts"
import { putState, sessionStoreWith } from "../../../../../session-store.ts"

afterEach(() => {
  cleanup()
  // 過去のターンを選ぶと hash に乗る（`stores/turn-selection.tsx`）ので、次のテストへ持ち越さない。
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
    status: { kind: "finished", result: { content: "ok", isError: false } },
    ...overrides,
  }
}

// 姿は store に入れる（**描き直しはフレームが届いたときだけ**起きるので、記録を足すのも
// サーバと同じ経路で行う）。
let store: SessionStore = sessionStoreWith(INITIAL_SESSION_STATE)

/** `turn` を渡すと、そのターンの進み具合で描く（既定は動いていない）。 */
function renderMainView(
  records: readonly SessionRecord[],
  turn: SessionState["turn"] = INITIAL_SESSION_STATE.turn,
): RenderResult {
  // 動いているターンを渡したときは、記録の本文がいまの SDK ターンで届いたものとして扱う
  // （前の SDK ターンで確定した本文は、動いているあいだも出したままになるため）。
  const bodiesInTurn =
    turn.kind === "running" ? { report: true, utterance: true } : INITIAL_SESSION_STATE.bodiesInTurn
  store = sessionStoreWith({ ...INITIAL_SESSION_STATE, records, turn, bodiesInTurn })
  // `MainView` は `<RepositoryFileLinkProvider>`（レポートのパスを押せる部品にする一覧の取得）を
  // 内側で mount するので `useQuery` が要る。ここでは一覧の中身を見ないので、フェッチそのものは
  // 差し替えない（`window.fetch` は happy-dom の対象外なので落ちるだけで、テストは待たない）。
  return render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <SessionStoreContext.Provider value={store}>
        <TurnSelectionProvider>
          <QuestionAnswerProvider>
            <QuestionScrollProvider>
              <MainView />
            </QuestionScrollProvider>
          </QuestionAnswerProvider>
        </TurnSelectionProvider>
      </SessionStoreContext.Provider>
    </QueryClientProvider>,
  )
}

/**
 * 札の頭のボタンを押す。選択は hash に乗り、**happy-dom は `hashchange` を次のタスクで出す**ので
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
    putState(store, { ...INITIAL_SESSION_STATE, records })
  })
}

describe("MainView（ミニ立ち絵を置く原点）", () => {
  // 筆先の座標はこの入れ物の左上が原点（`domain/reveal/brush-tip.ts`）。**印が外れると、書き終わった
  // ミニ立ち絵の置き場所が黙って消える**ので、名前が付いていることだけをここで見る
  // （実際にどこに見えるかは目視。`docs/architecture.md`「手で確かめること」）。
  it("ターンを載せる入れ物に、筆先の原点の印が付く", () => {
    const { container } = renderMainView([
      requestRecord({ text: "1つ目", turnId: 0 }),
      detailRecord("1つ目のレポート"),
    ])

    expect(container.querySelector(`[${BRUSH_ORIGIN_ATTRIBUTE}]`)).not.toBeNull()
  })
})

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
 * `turn-header.tsx` の `.turn-title-text`）。
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

/**
 * タイトル + `⌄` の開く口（`turn-header.tsx` の `.turn-title-toggle`）。アクセシブルネームが
 * 見ているタイトルそのもの（動く文字列）になったので、`button()` の名前検索ではなく
 * class で直接探す。
 */
function historyToggle(): HTMLButtonElement {
  const found = document.querySelector('[class*="turn-title-toggle"]')
  if (!(found instanceof HTMLButtonElement)) {
    throw new Error("タイトルの `⌄` ボタンが見つからない")
  }
  return found
}

function openHistory(): void {
  act(() => {
    fireEvent.click(historyToggle())
  })
}

describe("MainView（札の頭）", () => {
  it("最新のターンを出し、タイトル・n / N・「最新」の印が付く", () => {
    renderMainView(threeTurns())

    expect(title()).toBe("3つ目")
    expect(position()).toBe("3 / 3")
    expect(screen.getByText("最新")).toBeDefined()
    expect(screen.queryByRole("button", { name: TO_NEWEST })).toBeNull()
    expect(screen.getByText("3つ目のレポート")).toBeDefined()
  })

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

  it("端ではその側を押せない（最新では ›、いちばん古いターンでは ‹）", () => {
    renderMainView(threeTurns())

    // **押せないは `aria-disabled` の1通り**（`Button`）。本物の `disabled` にはしないので、
    // フォーカスは残る（`button.test.tsx` と同じ確かめ方）。
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

  it("ターンが1件だけでも札の頭を出す（前後はどちらも押せない）", () => {
    renderMainView([requestRecord({ text: "ただ1つの依頼", turnId: 0 }), detailRecord("本文")])

    expect(title()).toBe("ただ1つの依頼")
    expect(position()).toBe("1 / 1")
    expect(button(OLDER).getAttribute("aria-disabled")).toBe("true")
    expect(button(NEWER).getAttribute("aria-disabled")).toBe("true")
    expect(screen.getByText("最新")).toBeDefined()
  })

  it("タイトルは見ているターンの依頼の1行目で、全文は title でも読める", () => {
    renderMainView([
      requestRecord({ text: "架空の依頼の1行目\n2行目", turnId: 0 }),
      detailRecord("本文"),
    ])

    expect(title()).toBe("架空の依頼の1行目")
    expect(historyToggle().title).toBe("架空の依頼の1行目")
  })

  it("タイトルと `⌄` は h2 の中の1つのボタンで、アクセシブルネームがタイトルの文字になる", () => {
    renderMainView(threeTurns())

    const heading = screen.getByRole("heading", { level: 2 })
    const toggle = screen.getByRole("button", { name: "3つ目" })

    expect(heading.contains(toggle)).toBe(true)
    expect(toggle).toBe(historyToggle())
  })
})

describe("MainView（一覧: 窓の中のやり取りへ飛ぶ）", () => {
  it("タイトル（`⌄` と同じボタン）を押すと一覧が開き、窓の中の件数ぶんの行が出る。もう一度押すと閉じる", () => {
    renderMainView(threeTurns())

    expect(document.querySelector(".turn-history")).toBeNull()

    openHistory()
    expect(document.querySelectorAll(".turn-history-row")).toHaveLength(3)
    expect(historyToggle().getAttribute("aria-expanded")).toBe("true")

    openHistory()
    expect(document.querySelector(".turn-history")).toBeNull()
  })

  it("外側を押しても閉じる", () => {
    renderMainView(threeTurns())

    openHistory()
    expect(document.querySelector(".turn-history")).not.toBeNull()

    fireEvent.pointerDown(document.body)
    expect(document.querySelector(".turn-history")).toBeNull()
  })

  it("行を押すとそのやり取りへ移り、一覧が閉じる", () => {
    renderMainView(threeTurns())

    openHistory()
    press("1 / 3: 1つ目")

    expect(title()).toBe("1つ目")
    expect(document.querySelector(".turn-history")).toBeNull()
  })

  it("最新の行を押すと追従に戻る（hash の turn が外れる）", () => {
    renderMainView(threeTurns())

    press(OLDER)
    press(OLDER)
    expect(title()).toBe("1つ目")

    openHistory()
    press("最新: 3つ目")

    expect(title()).toBe("3つ目")
    expect(window.location.hash).not.toContain("turn=")
  })

  it("Escape で閉じ、フォーカスがタイトルの `⌄` ボタンへ戻る", () => {
    renderMainView(threeTurns())
    const toggle = historyToggle()

    openHistory()
    expect(document.querySelector(".turn-history")).not.toBeNull()

    fireEvent.keyDown(document, { key: "Escape" })
    expect(document.querySelector(".turn-history")).toBeNull()
    expect(document.activeElement).toBe(toggle)
  })

  it("見ている行にだけ印（●）が付き、他は○のまま", () => {
    renderMainView(threeTurns())

    press(OLDER)
    openHistory()

    const rows = [...document.querySelectorAll(".turn-history-row")]
    const marks = rows.map((row) => row.querySelector(".turn-history-mark")?.textContent)
    const current = rows.filter((row) => row.querySelector('[aria-current="true"]') !== null)

    expect(current).toHaveLength(1)
    expect(current[0]?.querySelector('[aria-current="true"]')?.getAttribute("aria-label")).toBe(
      "2 / 3: 2つ目",
    )
    expect(marks.filter((mark) => mark === "●")).toHaveLength(1)
    expect(marks.filter((mark) => mark === "○")).toHaveLength(2)
  })

  it("行は選択できる依頼の全文（複数行）と、飛ぶ口（印 + 番号だけの別のボタン）に分かれる", () => {
    renderMainView([
      requestRecord({ text: "1つ目の1行目\n1つ目の2行目", turnId: 0 }),
      detailRecord("1つ目のレポート"),
    ])

    openHistory()

    const row = document.querySelector(".turn-history-row")
    if (row === null) {
      throw new Error("行が見つからない")
    }
    const text = row.querySelector(".turn-history-text")
    const jump = row.querySelector(".turn-history-jump")

    // 全文（2行目以降も含む）が、選択できるただの文字として入っている。
    expect(text?.textContent).toBe("1つ目の1行目\n1つ目の2行目")
    // 飛ぶ口は印 + 番号だけで、依頼の文字は持たない（ボタンの中は選択できないため）。
    expect(jump?.textContent).not.toContain("1つ目の1行目")
    expect(jump?.tagName).toBe("BUTTON")
    // 依頼の文字は `<button>` の外にある。
    expect(text?.closest("button")).toBeNull()
  })
})

describe("MainView（依頼の続き）", () => {
  it("1行の依頼はタイトルにだけ出て、本文側に二度は出ない", () => {
    renderMainView([requestRecord({ text: "架空の依頼", turnId: 0 }), detailRecord("本文")])

    expect(screen.getAllByText("架空の依頼")).toHaveLength(1)
    expect(document.querySelector("details[open]")).toBeNull()
  })

  it("複数行の依頼は、2行目以降が開いた <details> で全部読める（1行目は二度出さない）", () => {
    renderMainView([
      requestRecord({ text: "架空の依頼の1行目\n1. 起こす\n2. 落ちる", turnId: 0 }),
      detailRecord("本文"),
    ])

    const details = document.querySelector("details")
    expect(details?.open).toBe(true)
    expect(details?.textContent).toContain("1. 起こす")
    expect(details?.textContent).toContain("2. 落ちる")
    expect(details?.textContent).not.toContain("架空の依頼の1行目")
    expect(screen.getAllByText("架空の依頼の1行目")).toHaveLength(1)
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

    const scrollIntoView = spyOn(Element.prototype, "scrollIntoView").mockImplementation(() => {})

    press(OLDER)

    expect(scrollIntoView).toHaveBeenCalledTimes(1)
    expect(scrollIntoView.mock.calls[0]?.[0]).toEqual({ block: "start" })

    scrollIntoView.mockRestore()
  })

  it("出ているターンが無いときは呼ばれない", () => {
    const scrollIntoView = spyOn(Element.prototype, "scrollIntoView").mockImplementation(() => {})

    renderMainView([])

    expect(scrollIntoView).not.toHaveBeenCalled()

    scrollIntoView.mockRestore()
  })
})

describe("MainView（セリフはレポートに出さない）", () => {
  it("セリフの記録が混ざっても、レポートには出ずターンの区切りも変わらない", () => {
    renderMainView([
      requestRecord({ text: "1つ目", turnId: 0 }),
      speechRecord({ text: "1つ目のセリフ" }),
      detailRecord("1つ目のレポート"),
      requestRecord({ text: "2つ目", turnId: 1 }),
      speechRecord({ text: "2つ目のセリフ" }),
      detailRecord("2つ目のレポート"),
    ])

    expect(position()).toBe("2 / 2")
    expect(screen.getByText("2つ目のレポート")).toBeDefined()
    expect(screen.queryByText("2つ目のセリフ")).toBeNull()

    // 1つ前も、セリフ抜きのレポートだけが出る（ターンの区切りはずれない）。
    press(OLDER)
    expect(title()).toBe("1つ目")
    expect(screen.getByText("1つ目のレポート")).toBeDefined()
    expect(screen.queryByText("1つ目のセリフ")).toBeNull()
  })
})

describe("MainView（ツールの行はレポートに出ない）", () => {
  it("ファイルを変えた操作もサブエージェントの起動も行にならない（枠ごと消える）", () => {
    const { container } = renderMainView([
      requestRecord({ text: "依頼", turnId: 0 }),
      tool({ toolUseId: "t1", name: "Edit", input: { file_path: "src/a.ts" } }),
      tool({ toolUseId: "t2", name: "Agent", input: { description: "調査タスク" } }),
    ])

    expect(screen.queryByText(/Edit:/)).toBeNull()
    expect(screen.queryByText(/Agent:/)).toBeNull()
    expect(container.querySelectorAll(".tool-block")).toHaveLength(0)
    // ツールしか無いステップは、レポートも無いので枠ごと消える。
    expect(container.querySelectorAll(".main-step")).toHaveLength(0)
  })

  it("失敗したツールも引数も出力も行にならない（過程はサイドバーに寄せた）", () => {
    const { container } = renderMainView([
      requestRecord({ text: "依頼", turnId: 0 }),
      tool({
        toolUseId: "t1",
        name: "Bash",
        input: { command: "架空のコマンド" },
        status: { kind: "finished", result: { content: "架空のエラー出力", isError: true } },
      }),
    ])

    expect(screen.queryByText(/架空のコマンド/)).toBeNull()
    expect(screen.queryByText(/架空のエラー出力/)).toBeNull()
    expect(container.querySelectorAll(".tool-block")).toHaveLength(0)
    expect(container.querySelectorAll(".main-step")).toHaveLength(0)
  })

  it("最後でない本文は落ち、ツールのチップも残らない（枠ごと消える）", () => {
    const { container } = renderMainView([
      requestRecord({ text: "依頼", turnId: 0 }),
      detailRecord("まず直すね"),
      tool({ toolUseId: "t1", name: "Write", input: { file_path: "src/b.ts" } }),
      detailRecord("直したよ"),
    ])

    expect(screen.queryByText("まず直すね")).toBeNull()
    expect(container.querySelectorAll(".main-step")).toHaveLength(1)
  })

  it("ツールを何十件呼んだやり取りでも「省略した」の行は出ない（上限に数えない）", () => {
    const { container } = renderMainView([
      requestRecord({ text: "依頼", turnId: 0 }),
      reportRecord("## 調べた結果\n\n- 1つめ\n- 2つめ"),
      ...Array.from({ length: 60 }, (_, index) =>
        tool({ toolUseId: `t${String(index)}`, name: "Read", input: { file_path: "src/a.ts" } }),
      ),
      reportRecord("## 直した箇所\n\n- src/a.ts\n- src/b.ts"),
    ])

    expect(container.querySelector(".turn-dropped")).toBeNull()
    expect(screen.getByText("直した箇所")).not.toBeNull()
    expect(screen.getByText("調べた結果")).not.toBeNull()
  })
})

describe("MainView（中間レポート）", () => {
  it("最後でない report は、中間レポートの印が付いた枠で出る", () => {
    const { container } = renderMainView(
      [
        requestRecord({ text: "依頼", turnId: 0 }),
        reportRecord("## 調べた結果\n\n- 1つ目の発見\n- 2つ目の発見"),
        tool({ toolUseId: "t1", name: "Write", input: { file_path: "src/b.ts" } }),
        reportRecord("書きかけの結論"),
      ],
      { kind: "running", startedAt: 0 },
    )

    expect(screen.getByText("中間レポート")).toBeDefined()
    expect(screen.getByText("1つ目の発見")).toBeDefined()
    expect(container.querySelectorAll(".main-step.is-interim")).toHaveLength(1)
  })

  it("最後の report は中間レポートにしない（印は付かない）", () => {
    const { container } = renderMainView([
      requestRecord({ text: "依頼", turnId: 0 }),
      reportRecord("## 調べた結果\n\n- 1つ目の発見\n- 2つ目の発見"),
      tool({ toolUseId: "t1", name: "Write", input: { file_path: "src/b.ts" } }),
      reportRecord("## 直した箇所\n\n- src/a.ts\n- src/b.ts"),
    ])

    expect(screen.getByText("直した箇所")).toBeDefined()
    expect(container.querySelectorAll(".main-step")).toHaveLength(2)
    expect(container.querySelectorAll(".main-step.is-interim")).toHaveLength(1)
  })

  it("後ろに別のレポートが現れた中間レポートは <details> で畳んで出す", () => {
    const { container } = renderMainView([
      requestRecord({ text: "依頼", turnId: 0 }),
      reportRecord("## 調べた結果\n\n- 1つ目の発見\n- 2つ目の発見"),
      tool({ toolUseId: "t1", name: "Write", input: { file_path: "src/b.ts" } }),
      reportRecord("## 直した箇所\n\n- src/a.ts\n- src/b.ts"),
    ])

    const interimSteps = container.querySelectorAll(".main-step.is-interim")
    expect(interimSteps).toHaveLength(1)
    expect(interimSteps[0]?.tagName).toBe("DETAILS")
    expect((interimSteps[0] as HTMLDetailsElement).open).toBe(false)
    expect(interimSteps[0]?.querySelector("summary")?.textContent).toBe("中間レポート: 調べた結果")
  })

  it("まだ追い越されていない最後の中間レポートは畳まず開いたまま（<section> のまま）", () => {
    // 動いているあいだ、いちばん新しい report は出ないので、手前の中間レポートを追い越すものが無い。
    const { container } = renderMainView(
      [
        requestRecord({ text: "依頼", turnId: 0 }),
        reportRecord("## 調べた結果\n\n- 1つ目の発見\n- 2つ目の発見"),
        tool({ toolUseId: "t1", name: "Write", input: { file_path: "src/b.ts" } }),
        reportRecord("書きかけの結論"),
      ],
      { kind: "running", startedAt: 0 },
    )

    const interimSteps = container.querySelectorAll(".main-step.is-interim")
    expect(interimSteps).toHaveLength(1)
    expect(interimSteps[0]?.tagName).toBe("SECTION")
    expect(screen.getByText("1つ目の発見")).toBeDefined()
  })

  it("複数の中間レポートが追い越されると全部畳まれ、それぞれの <summary> に先頭行が出る", () => {
    const { container } = renderMainView([
      requestRecord({ text: "依頼", turnId: 0 }),
      reportRecord("## 調べた結果\n\n- 1つ目の発見\n- 2つ目の発見"),
      tool({ toolUseId: "t1", name: "Write", input: { file_path: "src/a.ts" } }),
      reportRecord("## 直した箇所\n\n- src/a.ts\n- src/b.ts"),
      tool({ toolUseId: "t2", name: "Write", input: { file_path: "src/b.ts" } }),
      reportRecord("## 片付いた\n\n- 1件目\n- 2件目"),
    ])

    const interimSteps = [...container.querySelectorAll(".main-step.is-interim")]
    expect(interimSteps).toHaveLength(2)
    expect(interimSteps.every((step) => step.tagName === "DETAILS")).toBe(true)
    expect(interimSteps.map((step) => step.querySelector("summary")?.textContent)).toEqual([
      "中間レポート: 調べた結果",
      "中間レポート: 直した箇所",
    ])
    expect(screen.getByText("片付いた")).toBeDefined()
  })

  it("上限を超えて古いステップが落ちても、開いた <details> が別のステップに化けない", () => {
    // 十分な数の中間レポート（それぞれ report + tool の対）を積み、1つのやり取りが画面に出す
    // 記録の上限（40。**ツールの実行は数えない**ので、数えるのはレポートの件数）を超えさせる。
    // 全部のあとに非中間の締めの report を置くので、手前は全部 superseded = true になり
    // <details> で畳まれる（既存の「複数の中間レポートが追い越されると全部畳まれ」ケースと
    // 同じ形）。
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
      if (details === undefined || details.tagName !== "DETAILS") {
        throw new Error(`summary "${text}" を持つ <details> が見つからない`)
      }
      return details as HTMLDetailsElement
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

describe("MainView（質問の記録）", () => {
  // `QuestionRecord` を直接見る（`MainView` を経由した「記録が積まれてから見えるまで」は
  // `test/shared/session-state.test.ts` の畳み込みと、この部品の組み合わせで足りる）。
  it("選ばれた答えに印が付く", () => {
    const entry: MainViewQuestion = {
      kind: "question",
      questions: [
        {
          header: "確認",
          text: "どちらにする？",
          multiSelect: false,
          options: [
            { label: "案A", description: "", preview: undefined },
            { label: "案B", description: "", preview: undefined },
          ],
        },
      ],
      answers: [["案B"]],
    }

    const { container } = render(<QuestionRecord entry={entry} />)

    const options = [...container.querySelectorAll(".question-option")]
    const optionA = options.find((option) => option.textContent?.includes("案A"))
    const optionB = options.find((option) => option.textContent?.includes("案B"))

    expect(optionB?.className).toContain("is-chosen")
    expect(optionA?.className).not.toContain("is-chosen")
  })

  it("複数選択の答えは、選んだ選択肢すべてに印が付く", () => {
    const entry: MainViewQuestion = {
      kind: "question",
      questions: [
        {
          header: "確認",
          text: "どれを試す？",
          multiSelect: true,
          options: [
            { label: "案A", description: "", preview: undefined },
            { label: "案B", description: "", preview: undefined },
            { label: "案C", description: "", preview: undefined },
          ],
        },
      ],
      answers: [["案A", "案C"]],
    }

    const { container } = render(<QuestionRecord entry={entry} />)

    const chosen = [...container.querySelectorAll(".question-option.is-chosen")].map(
      (option) => option.textContent,
    )
    expect(chosen).toEqual(["■ 案A", "■ 案C"])
  })

  it("自由入力の答えは、選択肢の下に別の行で出る", () => {
    const entry: MainViewQuestion = {
      kind: "question",
      questions: [
        {
          header: "確認",
          text: "どちらにする？",
          multiSelect: false,
          options: [
            { label: "案A", description: "", preview: undefined },
            { label: "案B", description: "", preview: undefined },
          ],
        },
      ],
      answers: [["どちらでもない架空の答え"]],
    }

    const { container } = render(<QuestionRecord entry={entry} />)

    const options = [...container.querySelectorAll(".question-option")].map(
      (option) => option.textContent,
    )
    expect(options).toEqual(["○ 案A", "○ 案B", "● どちらでもない架空の答え（自由入力）"])
    expect(container.querySelector(".question-option.is-free-text")).not.toBeNull()
  })

  it("選択肢は送られた順ではなくラベルの辞書順で出す（並べ替えても答えの印は崩れない）", () => {
    const entry: MainViewQuestion = {
      kind: "question",
      questions: [
        {
          header: "確認",
          text: "どれにする？",
          multiSelect: false,
          options: [
            { label: "案C", description: "", preview: undefined },
            { label: "案A", description: "", preview: undefined },
            { label: "案B", description: "", preview: undefined },
          ],
        },
      ],
      answers: [["案B"]],
    }

    const { container } = render(<QuestionRecord entry={entry} />)

    const options = [...container.querySelectorAll(".question-option")]
    expect(options.map((option) => option.textContent)).toEqual(["○ 案A", "● 案B", "○ 案C"])
  })

  it("質問が2件あると、答えは質問ごとに突き合わせる", () => {
    const entry: MainViewQuestion = {
      kind: "question",
      questions: [
        {
          header: "確認1",
          text: "1つ目は？",
          multiSelect: false,
          options: [
            { label: "案A", description: "", preview: undefined },
            { label: "案B", description: "", preview: undefined },
          ],
        },
        {
          header: "確認2",
          text: "2つ目は？",
          multiSelect: false,
          options: [
            { label: "案A", description: "", preview: undefined },
            { label: "案C", description: "", preview: undefined },
          ],
        },
      ],
      answers: [["案B"], ["案A"]],
    }

    const { container } = render(<QuestionRecord entry={entry} />)

    const records = [...container.querySelectorAll(".question-record")]
    expect(
      records.map((record) => record.querySelector(".question-option.is-chosen")?.textContent),
    ).toEqual(["● 案B", "● 案A"])
  })
})

describe("MainView（質問の記録に残す preview）", () => {
  function entryWithPreview(): MainViewQuestion {
    return {
      kind: "question",
      questions: [
        {
          header: "確認",
          text: "どちらにする？",
          multiSelect: false,
          options: [
            { label: "案A", description: "", preview: "### 案Aの下書き" },
            { label: "案B", description: "", preview: "### 案Bの下書き" },
          ],
        },
      ],
      answers: [["案B"]],
    }
  }

  function openDetails(container: HTMLElement): void {
    const details = container.querySelector("details")
    if (details === null) {
      throw new Error("折りたたみが無い")
    }
    details.open = true
    fireEvent(details, new Event("toggle"))
  }

  it("preview を持つ選択肢が無ければ、折りたたみを作らない", () => {
    const entry: MainViewQuestion = {
      kind: "question",
      questions: [
        {
          header: "確認",
          text: "どちらにする？",
          multiSelect: false,
          options: [
            { label: "案A", description: "", preview: undefined },
            { label: "案B", description: "", preview: undefined },
          ],
        },
      ],
      answers: [["案B"]],
    }

    const { container } = render(<QuestionRecord entry={entry} />)

    expect(container.querySelector("details")).toBeNull()
  })

  it("preview は折りたたまれていて、開くまで描かない", () => {
    const { container } = render(<QuestionRecord entry={entryWithPreview()} />)

    expect(container.querySelector("details")?.open).toBe(false)
    expect(screen.queryByText("案Aの下書き")).toBeNull()
  })

  it("開くと、選択肢ごとの preview が Markdown として出る", () => {
    const { container } = render(<QuestionRecord entry={entryWithPreview()} />)

    act(() => {
      openDetails(container)
    })

    // `###` はレポートと同じ段下げで `h5` になる（`markdown.tsx` の SubHeading）。
    expect(screen.getByText("案Aの下書き").tagName).toBe("H5")
    expect(screen.getByText("案Bの下書き").tagName).toBe("H5")
  })

  it("開いた preview にも、選ばれた答えの印が付く", () => {
    const { container } = render(<QuestionRecord entry={entryWithPreview()} />)

    act(() => {
      openDetails(container)
    })

    const labels = [...container.querySelectorAll(".question-preview-label")].map(
      (label) => label.textContent,
    )
    expect(labels).toEqual(["○ 案A", "● 案B"])
  })
})
