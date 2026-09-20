import { afterEach, describe, expect, it, spyOn } from "bun:test"

import { act, cleanup, fireEvent, render, screen, type RenderResult } from "@testing-library/react"

import { MainView } from "../../../../src/browser/features/main-view/main-view.tsx"
import { QuestionRecord } from "../../../../src/browser/features/main-view/question-record.tsx"
import { type SessionStore, SessionStoreContext } from "../../../../src/browser/stores/session.tsx"
import { TurnSelectionProvider } from "../../../../src/browser/stores/turn-selection.tsx"
import { type MainViewQuestion } from "../../../../src/shared/main-view.ts"
import { INITIAL_SESSION_STATE, type SessionRecord } from "../../../../src/shared/session-state.ts"
import { putState, sessionStoreWith } from "../../session-store.ts"

afterEach(() => {
  cleanup()
})

function request(text: string): SessionRecord {
  return { kind: "request", text }
}

function detail(markdown: string): SessionRecord {
  return { kind: "detail", markdown }
}

function speech(text: string): SessionRecord {
  return { kind: "speech", text, expression: "default" }
}

function tool(
  overrides: Partial<Extract<SessionRecord, { readonly kind: "tool" }>>,
): SessionRecord {
  return {
    kind: "tool",
    toolUseId: "fake-tool",
    name: "Read",
    input: {},
    nested: false,
    result: { content: "ok", isError: false },
    ...overrides,
  }
}

// 姿は store に入れる（**描き直しはフレームが届いたときだけ**起きるので、記録を足すのも
// サーバと同じ経路で行う）。
let store: SessionStore = sessionStoreWith(INITIAL_SESSION_STATE)

function renderMainView(records: readonly SessionRecord[]): RenderResult {
  store = sessionStoreWith({ ...INITIAL_SESSION_STATE, records })
  return render(
    <SessionStoreContext.Provider value={store}>
      <TurnSelectionProvider>
        <MainView />
      </TurnSelectionProvider>
    </SessionStoreContext.Provider>,
  )
}

function rerenderMainView(records: readonly SessionRecord[]): void {
  act(() => {
    putState(store, { ...INITIAL_SESSION_STATE, records })
  })
}

describe("MainView（タブの規則）", () => {
  it("3ターンまでタブが出て、新しいターンで先頭（今回）へ戻る", () => {
    renderMainView([
      request("1つ目"),
      detail("1つ目のレポート"),
      request("2つ目"),
      detail("2つ目のレポート"),
      request("3つ目"),
      detail("3つ目のレポート"),
    ])

    expect(screen.getAllByRole("button").map((button) => button.textContent)).toEqual([
      "今回",
      "1つ前",
      "2つ前",
    ])
    expect(screen.getByText("3つ目のレポート")).toBeDefined()

    // 4つ目が始まると、先頭（今回）は自動でそちらに変わる。
    rerenderMainView([
      request("1つ目"),
      detail("1つ目のレポート"),
      request("2つ目"),
      detail("2つ目のレポート"),
      request("3つ目"),
      detail("3つ目のレポート"),
      request("4つ目"),
      detail("4つ目のレポート"),
    ])

    expect(screen.getByText("4つ目のレポート")).toBeDefined()
    expect(screen.queryByText("3つ目のレポート")).toBeNull()
  })

  it("過去のタブを見ている間は、新しいターンが来ても動かない", () => {
    renderMainView([
      request("1つ目"),
      detail("1つ目のレポート"),
      request("2つ目"),
      detail("2つ目のレポート"),
      request("3つ目"),
      detail("3つ目のレポート"),
    ])

    // 「1つ前」（2つ目）のタブを選ぶ。
    fireEvent.click(screen.getByText("1つ前"))
    expect(screen.getByText("2つ目のレポート")).toBeDefined()

    // 新しいターンが始まっても、選んだタブのままでいる。
    rerenderMainView([
      request("1つ目"),
      detail("1つ目のレポート"),
      request("2つ目"),
      detail("2つ目のレポート"),
      request("3つ目"),
      detail("3つ目のレポート"),
      request("4つ目"),
      detail("4つ目のレポート"),
    ])

    expect(screen.getByText("2つ目のレポート")).toBeDefined()
    expect(screen.queryByText("4つ目のレポート")).toBeNull()
  })
})

describe("MainView（タブ切り替えでレポートの先頭へ戻す）", () => {
  it("タブを切り替えると、先頭へ戻す scrollIntoView が1回呼ばれる", () => {
    renderMainView([
      request("1つ目"),
      detail("1つ目のレポート"),
      request("2つ目"),
      detail("2つ目のレポート"),
    ])

    const scrollIntoView = spyOn(Element.prototype, "scrollIntoView").mockImplementation(() => {})

    fireEvent.click(screen.getByText("1つ前"))

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
  it("セリフの記録が混ざっても、レポートには出ずタブの並びも変わらない", () => {
    renderMainView([
      request("1つ目"),
      speech("1つ目のセリフ"),
      detail("1つ目のレポート"),
      request("2つ目"),
      speech("2つ目のセリフ"),
      detail("2つ目のレポート"),
    ])

    expect(screen.getAllByRole("button").map((button) => button.textContent)).toEqual([
      "今回",
      "1つ前",
    ])
    expect(screen.getByText("2つ目のレポート")).toBeDefined()
    expect(screen.queryByText("2つ目のセリフ")).toBeNull()

    // 「1つ前」も、セリフ抜きのレポートだけが出る（ターンの区切りはずれない）。
    fireEvent.click(screen.getByText("1つ前"))
    expect(screen.getByText("1つ目のレポート")).toBeDefined()
    expect(screen.queryByText("1つ目のセリフ")).toBeNull()
  })
})

describe("MainView（ツールの行はレポートに出ない）", () => {
  it("ファイルを変えた操作もサブエージェントの起動も行にならない（枠ごと消える）", () => {
    const { container } = renderMainView([
      request("依頼"),
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
      request("依頼"),
      tool({
        toolUseId: "t1",
        name: "Bash",
        input: { command: "架空のコマンド" },
        result: { content: "架空のエラー出力", isError: true },
      }),
    ])

    expect(screen.queryByText(/架空のコマンド/)).toBeNull()
    expect(screen.queryByText(/架空のエラー出力/)).toBeNull()
    expect(container.querySelectorAll(".tool-block")).toHaveLength(0)
    expect(container.querySelectorAll(".main-step")).toHaveLength(0)
  })

  it("本文の後ろにツールが続くと本文は落ち、チップも残らない（枠ごと消える）", () => {
    const { container } = renderMainView([
      request("依頼"),
      detail("まず直すね"),
      tool({ toolUseId: "t1", name: "Write", input: { file_path: "src/b.ts" } }),
    ])

    expect(screen.queryByText("まず直すね")).toBeNull()
    expect(container.querySelectorAll(".main-step")).toHaveLength(0)
  })

  it("ツールを何十件呼んだやり取りでも「省略した」の行は出ない（上限に数えない）", () => {
    const { container } = renderMainView([
      request("依頼"),
      detail("## 調べた結果\n\n- 1つめ\n- 2つめ"),
      ...Array.from({ length: 60 }, (_, index) =>
        tool({ toolUseId: `t${String(index)}`, name: "Read", input: { file_path: "src/a.ts" } }),
      ),
      detail("直したよ"),
    ])

    expect(container.querySelector(".turn-dropped")).toBeNull()
    expect(screen.getByText("直したよ")).not.toBeNull()
    expect(screen.getByText("調べた結果")).not.toBeNull()
  })
})

describe("MainView（中間レポート）", () => {
  it("まとまった本文の後ろにツールが続くと、中間レポートの印が付いた枠で残る", () => {
    const { container } = renderMainView([
      request("依頼"),
      detail("## 調べた結果\n\n- 1つ目の発見\n- 2つ目の発見"),
      tool({ toolUseId: "t1", name: "Write", input: { file_path: "src/b.ts" } }),
    ])

    expect(screen.getByText("中間レポート")).toBeDefined()
    expect(screen.getByText("1つ目の発見")).toBeDefined()
    expect(container.querySelectorAll(".main-step.is-interim")).toHaveLength(1)
  })

  it("最後に書いた本文は中間レポートにしない（印は付かない）", () => {
    const { container } = renderMainView([
      request("依頼"),
      detail("## 調べた結果\n\n- 1つ目の発見\n- 2つ目の発見"),
      tool({ toolUseId: "t1", name: "Write", input: { file_path: "src/b.ts" } }),
      detail("直したよ"),
    ])

    expect(screen.getByText("直したよ")).toBeDefined()
    expect(container.querySelectorAll(".main-step")).toHaveLength(2)
    expect(container.querySelectorAll(".main-step.is-interim")).toHaveLength(1)
  })

  it("後ろに別のレポートが現れた中間レポートは <details> で畳んで出す（T-161）", () => {
    const { container } = renderMainView([
      request("依頼"),
      detail("## 調べた結果\n\n- 1つ目の発見\n- 2つ目の発見"),
      tool({ toolUseId: "t1", name: "Write", input: { file_path: "src/b.ts" } }),
      detail("直したよ"),
    ])

    const interimSteps = container.querySelectorAll(".main-step.is-interim")
    expect(interimSteps).toHaveLength(1)
    expect(interimSteps[0]?.tagName).toBe("DETAILS")
    expect((interimSteps[0] as HTMLDetailsElement).open).toBe(false)
    expect(interimSteps[0]?.querySelector("summary")?.textContent).toBe("中間レポート: 調べた結果")
  })

  it("まだ追い越されていない最後の中間レポートは畳まず開いたまま（<section> のまま）", () => {
    const { container } = renderMainView([
      request("依頼"),
      detail("## 調べた結果\n\n- 1つ目の発見\n- 2つ目の発見"),
      tool({ toolUseId: "t1", name: "Write", input: { file_path: "src/b.ts" } }),
    ])

    const interimSteps = container.querySelectorAll(".main-step.is-interim")
    expect(interimSteps).toHaveLength(1)
    expect(interimSteps[0]?.tagName).toBe("SECTION")
    expect(screen.getByText("1つ目の発見")).toBeDefined()
  })

  it("複数の中間レポートが追い越されると全部畳まれ、それぞれの <summary> に先頭行が出る", () => {
    const { container } = renderMainView([
      request("依頼"),
      detail("## 調べた結果\n\n- 1つ目の発見\n- 2つ目の発見"),
      tool({ toolUseId: "t1", name: "Write", input: { file_path: "src/a.ts" } }),
      detail("## 直した箇所\n\n- src/a.ts\n- src/b.ts"),
      tool({ toolUseId: "t2", name: "Write", input: { file_path: "src/b.ts" } }),
      detail("できたよ"),
    ])

    const interimSteps = [...container.querySelectorAll(".main-step.is-interim")]
    expect(interimSteps).toHaveLength(2)
    expect(interimSteps.every((step) => step.tagName === "DETAILS")).toBe(true)
    expect(interimSteps.map((step) => step.querySelector("summary")?.textContent)).toEqual([
      "中間レポート: 調べた結果",
      "中間レポート: 直した箇所",
    ])
    expect(screen.getByText("できたよ")).toBeDefined()
  })

  it("上限を超えて古いステップが落ちても、開いた <details> が別のステップに化けない（T-165）", () => {
    // 十分な数の中間レポート（それぞれ detail + tool の対）を積み、1つのやり取りが画面に出す
    // 記録の上限（40。**ツールの実行は数えない**ので、数えるのはレポートの件数）を超えさせる。
    // 全部のあとに非中間の締めの report を置くので、手前は全部 superseded = true になり
    // <details> で畳まれる（既存の「複数の中間レポートが追い越されると全部畳まれ」ケースと
    // 同じ形）。
    const pair = (index: number): SessionRecord[] => [
      detail(`## 見出し${String(index)}\n\n- 発見A\n- 発見B`),
      tool({ toolUseId: `t${String(index)}`, name: "Write", input: { file_path: "src/a.ts" } }),
    ]

    const buildRecords = (pairCount: number): SessionRecord[] => [
      request("依頼"),
      ...Array.from({ length: pairCount }, (_, index) => pair(index)).flat(),
      detail("できたよ"),
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
            { label: "案A", description: "" },
            { label: "案B", description: "" },
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
            { label: "案A", description: "" },
            { label: "案B", description: "" },
            { label: "案C", description: "" },
          ],
        },
      ],
      answers: [["案A", "案C"]],
    }

    const { container } = render(<QuestionRecord entry={entry} />)

    const chosen = [...container.querySelectorAll(".question-option.is-chosen")].map(
      (option) => option.textContent,
    )
    expect(chosen).toEqual(["● 案A", "● 案C"])
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
            { label: "案A", description: "" },
            { label: "案B", description: "" },
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

  it("質問が2件あると、答えは質問ごとに突き合わせる", () => {
    const entry: MainViewQuestion = {
      kind: "question",
      questions: [
        {
          header: "確認1",
          text: "1つ目は？",
          multiSelect: false,
          options: [
            { label: "案A", description: "" },
            { label: "案B", description: "" },
          ],
        },
        {
          header: "確認2",
          text: "2つ目は？",
          multiSelect: false,
          options: [
            { label: "案A", description: "" },
            { label: "案C", description: "" },
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
