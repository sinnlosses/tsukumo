import { QueryClientProvider } from "@tanstack/react-query"
import { act, cleanup, fireEvent, render, screen, type RenderResult } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { MainView } from "../../../../../../../src/browser/components/page/conversation/components/main-view/main-view.tsx"
import { useQuestionDraft } from "../../../../../../../src/browser/stores/question-answer.ts"
import {
  INITIAL_SESSION_STATE,
  type SessionRecord,
  type SessionState,
} from "../../../../../../../src/shared/session/session-state.ts"
import {
  detailRecord,
  reportRecord,
  requestRecord,
} from "../../../../../../fixture/session-record.ts"
import { typedElement } from "../../../../../../typed-element.ts"
import { createTestQueryClient } from "../../../../../query-client.tsx"
import { putState, putSession } from "../../../../../session-store.ts"

afterEach(() => {
  cleanup()
  // 組み立て中の答えはモジュール単位で残るので、次のテストへ持ち越さない。
  useQuestionDraft.setState(useQuestionDraft.getInitialState(), true)
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

/**
 * タイトル + `⌄` の開く口（`TurnHeader` の `.turn-title-toggle`）。アクセシブルネームが
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
    expect(historyToggle().title).toBe("架空の依頼の1行目")
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
