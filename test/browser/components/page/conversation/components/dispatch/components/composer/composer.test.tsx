import { afterEach, describe, expect, it } from "bun:test"

import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"

import { Composer } from "../../../../../../../../../src/browser/components/page/conversation/components/dispatch/components/composer/composer.tsx"
import { QuestionAnswerProvider } from "../../../../../../../../../src/browser/stores/question-answer.tsx"
import { SessionStoreContext } from "../../../../../../../../../src/browser/stores/session.tsx"
import { type CharacterInfo } from "../../../../../../../../../src/shared/character.ts"
import { type PendingAsk } from "../../../../../../../../../src/shared/pending-ask.ts"
import {
  INITIAL_SESSION_STATE,
  type SessionState,
} from "../../../../../../../../../src/shared/session-state.ts"
import { characterInfo } from "../../../../../../../../fixture/character.ts"
import { typedElement } from "../../../../../../../../typed-element.ts"
import { rpcOutput, stubRpcFetch, type RpcFetchStub } from "../../../../../../../rpc-fetch-stub.ts"
import { type CommandSpy, sessionStoreWith } from "../../../../../../../session-store.ts"

// フィクスチャはすべて手で書いた架空のもの（docs/coding-standards.md「会話内容の扱い」）。
const FIXTURE_CHARACTER: CharacterInfo = characterInfo({
  pack: "架空パック",
  name: "架空の名前",
  expressions: [],
  editable: false,
})

// 架空の質問（答え待ち。入力欄は「答えを書く場所」に変わる）。
const QUESTION_PENDING = {
  kind: "question",
  id: "ask-question",
  questions: [
    {
      header: "架空の選択",
      text: "架空の質問",
      multiSelect: false,
      options: [{ label: "A案", description: "架空の説明A", preview: undefined }],
    },
  ],
} satisfies PendingAsk

// 架空のファイル一覧（`@` 補完が引く手続き `repository.listFiles` の代役）。
const FIXTURE_FILE_PATHS = [
  "src/browser/features/festival/composer.tsx",
  "src/browser/features/festival/file-suggestions.tsx",
  "src/cli.ts",
]

let fetchStub: RpcFetchStub | undefined = undefined

afterEach(() => {
  cleanup()
  fetchStub?.restore()
  fetchStub = undefined
})

/** ファイル一覧の手続きを、架空の一覧を返す代役に差し替える（呼ばれた手続きは代役が記録する）。 */
function stubFileListFetch(paths: readonly string[] = FIXTURE_FILE_PATHS): void {
  fetchStub = stubRpcFetch(() => rpcOutput(paths))
}

/** 呼ばれた手続きの名前（古い順）。 */
function fetchedProcedures(): readonly string[] {
  return (fetchStub?.calls() ?? []).map((call) => call.procedure)
}

// `@` 補完は `useQuery`（`file-suggestions.tsx`）で一覧を取るので `QueryClientProvider` が要る。
// キャッシュはテストをまたがせないので、テストごとに新しい `QueryClient` を作る。
function renderComposer(
  stateOverrides: Partial<SessionState> = {},
  dispatch: CommandSpy = () => {},
): void {
  const store = sessionStoreWith({ ...INITIAL_SESSION_STATE, ...stateOverrides }, dispatch)
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={client}>
      <SessionStoreContext.Provider value={store}>
        <QuestionAnswerProvider>
          <Composer />
        </QuestionAnswerProvider>
      </SessionStoreContext.Provider>
    </QueryClientProvider>,
  )
}

function textArea(): HTMLTextAreaElement {
  return typedElement(
    screen.getByPlaceholderText(/依頼を書く/),
    HTMLTextAreaElement,
    "依頼の入力欄",
  )
}

describe("Composer", () => {
  it("(3) IME の変換確定中の Command+Enter は送らない（isComposing）", () => {
    const calls: unknown[] = []
    renderComposer({}, (command) => calls.push(command))

    fireEvent.change(textArea(), { target: { value: "架空の依頼" } })
    fireEvent.keyDown(textArea(), { key: "Enter", metaKey: true, isComposing: true })

    expect(calls).toEqual([])
    expect(textArea().value).toBe("架空の依頼")
  })

  it("(3) 古いブラウザ向けの keyCode 229（IME 変換確定）でも送らない", () => {
    const calls: unknown[] = []
    renderComposer({}, (command) => calls.push(command))

    fireEvent.change(textArea(), { target: { value: "架空の依頼" } })
    fireEvent.keyDown(textArea(), { key: "Enter", metaKey: true, keyCode: 229 })

    expect(calls).toEqual([])
  })

  it("(6) 候補が出ている間は Ctrl+N / Ctrl+P で選択が上下に動く（Meta 併用は無視）", () => {
    renderComposer({
      slashCommands: ["alpha", "beta"],
      commandDescriptions: [
        { name: "alpha", description: undefined },
        { name: "beta", description: undefined },
      ],
    })

    fireEvent.change(textArea(), { target: { value: "/" } })

    const selected = (): string | undefined =>
      screen.getAllByRole("listitem").find((item) => item.className.includes("is-selected"))
        ?.textContent

    expect(selected()).toBe("/alpha")

    const forward = fireEvent.keyDown(textArea(), { key: "n", ctrlKey: true })
    expect(forward).toBe(false) // preventDefault が呼ばれた
    expect(selected()).toBe("/beta")

    // Meta（Command）と組み合わせたときは反応しない。
    const withMeta = fireEvent.keyDown(textArea(), { key: "n", ctrlKey: true, metaKey: true })
    expect(withMeta).toBe(true) // preventDefault は呼ばれない
    expect(selected()).toBe("/beta")

    const backward = fireEvent.keyDown(textArea(), { key: "p", ctrlKey: true })
    expect(backward).toBe(false)
    expect(selected()).toBe("/alpha")
  })

  it("候補が出ていないときは Ctrl+N / Ctrl+P は何もしない（preventDefault も呼ばない）", () => {
    const calls: unknown[] = []
    renderComposer({}, (command) => calls.push(command))

    fireEvent.change(textArea(), { target: { value: "架空の依頼" } })

    const forward = fireEvent.keyDown(textArea(), { key: "n", ctrlKey: true })
    const backward = fireEvent.keyDown(textArea(), { key: "p", ctrlKey: true })

    expect(forward).toBe(true) // preventDefault は呼ばれない
    expect(backward).toBe(true)
    expect(calls).toEqual([])
    expect(textArea().value).toBe("架空の依頼")
  })

  it("「コマンドを補完する」は空の入力欄に `/` を打ち、コマンドの候補が開く（送信しない）", () => {
    const calls: unknown[] = []
    renderComposer({ slashCommands: ["clear"] }, (command) => calls.push(command))

    fireEvent.click(screen.getByRole("button", { name: "コマンドを補完する" }))

    expect(textArea().value).toBe("/")
    expect(screen.getAllByRole("listitem").map((item) => item.textContent)).toEqual(["/clear"])
    expect(calls).toEqual([])
  })

  it("「ファイルを補完する」は語の途中なら空白を挟んで `@` を打ち、ファイルの候補が開く", async () => {
    stubFileListFetch()
    renderComposer()

    fireEvent.change(textArea(), { target: { value: "架空の依頼", selectionStart: 5 } })
    fireEvent.click(screen.getByRole("button", { name: "ファイルを補完する" }))

    expect(textArea().value).toBe("架空の依頼 @")
    await waitFor(() => {
      expect(screen.getAllByRole("listitem")).toHaveLength(FIXTURE_FILE_PATHS.length)
    })
  })

  it("@ で git 管理下のファイルの候補が出て、Tab で `@<パス> ` が入り送信しない", async () => {
    stubFileListFetch()
    const calls: unknown[] = []
    renderComposer({}, (command) => calls.push(command))

    fireEvent.change(textArea(), { target: { value: "@src/browser/fe" } })

    await waitFor(() => {
      expect(screen.getAllByRole("listitem")).toHaveLength(2)
    })
    expect(screen.getAllByRole("listitem").map((item) => item.textContent)).toEqual([
      "src/browser/features/festival/composer.tsx",
      "src/browser/features/festival/file-suggestions.tsx",
    ])

    fireEvent.keyDown(textArea(), { key: "Tab" })

    expect(textArea().value).toBe("@src/browser/features/festival/composer.tsx ")
    expect(calls).toEqual([])
  })

  it("一覧は起動トークンを付けて1回だけ取りに行く（打鍵ごとに取り直さない）", async () => {
    stubFileListFetch()
    renderComposer()

    fireEvent.change(textArea(), { target: { value: "@src" } })
    await waitFor(() => {
      expect(screen.getAllByRole("listitem").length).toBeGreaterThan(0)
    })
    fireEvent.change(textArea(), { target: { value: "@src/cli" } })
    await waitFor(() => {
      expect(screen.getAllByRole("listitem")).toHaveLength(1)
    })

    expect(fetchedProcedures()).toEqual(["repository/listFiles"])
  })

  it("キャレットが文の途中にあっても、その位置の @ だけを置き換える", async () => {
    stubFileListFetch()
    renderComposer()

    // 「@src/cli」の直後（8文字目）にキャレットがある状態。
    fireEvent.change(textArea(), { target: { value: "@src/cli と書いた", selectionStart: 8 } })
    await waitFor(() => {
      expect(screen.getAllByRole("listitem")).toHaveLength(1)
    })

    fireEvent.keyDown(textArea(), { key: "Tab" })

    // すぐ後ろがすでに空白なので、空白を2つ並べない。
    expect(textArea().value).toBe("@src/cli.ts と書いた")
    expect(textArea().selectionStart).toBe(11)
  })

  it("/ の補完が出ている間はファイルの一覧を取りに行かない（候補は同時に出ない）", () => {
    stubFileListFetch()
    renderComposer({
      slashCommands: ["clear"],
      commandDescriptions: [{ name: "clear", description: undefined }],
    })

    fireEvent.change(textArea(), { target: { value: "/cl" } })

    expect(screen.getAllByRole("listitem").map((item) => item.textContent)).toEqual(["/clear"])
    expect(fetchedProcedures()).toEqual([])
  })

  it("答え待ちがある間は @ の候補も出さない", () => {
    stubFileListFetch()
    renderComposer({
      pending: [{ kind: "permission", id: "ask-1", toolName: "Bash", input: {} }],
    })

    fireEvent.change(textArea(), { target: { value: "@src" } })

    expect(screen.queryAllByRole("listitem")).toHaveLength(0)
    expect(fetchedProcedures()).toEqual([])
  })

  it("質問が出ている間は、帯とプレースホルダが「答えを書く場所」に変わる", () => {
    renderComposer({ character: FIXTURE_CHARACTER, pending: [QUESTION_PENDING] })

    expect(screen.getByText(/架空の名前 が質問しています/)).toBeDefined()
    expect(screen.getByPlaceholderText("選択肢以外の答えを書く…")).toBeDefined()
    expect(screen.queryByPlaceholderText(/依頼を書く/)).toBeNull()
  })

  it("質問に答えている間の Command+Enter は、依頼ではなく自由入力の答えとして届く", () => {
    const calls: unknown[] = []
    renderComposer(
      // 質問を待っている間もターンは進行中（SDK が答えを待って止まっている）。
      { pending: [QUESTION_PENDING], turn: { kind: "running", startedAt: 0 } },
      (command) => calls.push(command),
    )

    const answerArea = typedElement(
      screen.getByPlaceholderText("選択肢以外の答えを書く…"),
      HTMLTextAreaElement,
      "自由記述の答えの入力欄",
    )
    fireEvent.change(answerArea, { target: { value: "架空の自由な答え" } })
    fireEvent.keyDown(answerArea, { key: "Enter", metaKey: true })

    expect(calls).toEqual([
      {
        procedure: "session.answer",
        id: "ask-question",
        answer: { kind: "answers", labels: [["架空の自由な答え"]] },
      },
    ])
    expect(answerArea.value).toBe("")
  })
})
