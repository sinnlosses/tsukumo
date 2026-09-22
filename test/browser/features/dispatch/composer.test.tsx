import { afterEach, describe, expect, it } from "bun:test"

import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"

import { Composer } from "../../../../src/browser/features/dispatch/composer.tsx"
import { SessionStoreContext } from "../../../../src/browser/stores/session.tsx"
import { type CharacterInfo } from "../../../../src/shared/character.ts"
import { INITIAL_SESSION_STATE, type SessionState } from "../../../../src/shared/session-state.ts"
import { characterInfo } from "../../../fixture/character.ts"
import { type CommandSpy, sessionStoreWith } from "../../session-store.ts"

// フィクスチャはすべて手で書いた架空のもの（docs/coding-standards.md「会話内容の扱い」）。
const FIXTURE_CHARACTER: CharacterInfo = characterInfo({
  pack: "架空パック",
  name: "架空の名前",
  expressions: [],
  editable: false,
})

// 架空のファイル一覧（`@` 補完が引く `GET /repository-file` の代役）。
const FIXTURE_FILE_PATHS = [
  "src/browser/features/dispatch/composer.tsx",
  "src/browser/features/dispatch/file-suggestions.tsx",
  "src/cli.ts",
]

let originalFetch: typeof globalThis.fetch | undefined = undefined
let fetchCalls: string[] = []

afterEach(() => {
  cleanup()
  if (originalFetch !== undefined) {
    globalThis.fetch = originalFetch
    originalFetch = undefined
  }
  fetchCalls = []
})

/** ファイル一覧の経路を、架空の一覧を返す代役に差し替え、呼ばれた URL を記録する。 */
function stubFileListFetch(paths: readonly string[] = FIXTURE_FILE_PATHS): void {
  originalFetch = globalThis.fetch
  const stub = (url: string): Promise<{ ok: true; json: () => Promise<unknown> }> => {
    fetchCalls.push(url)
    return Promise.resolve({ ok: true, json: () => Promise.resolve(paths) })
  }
  globalThis.fetch = stub as unknown as typeof globalThis.fetch
}

// `@` 補完は `useQuery`（`file-suggestions.tsx`）で一覧を取るので `QueryClientProvider` が要る。
// **キャッシュはテストをまたがせない**ので、テストごとに新しい `QueryClient` を作る。
function renderComposer(
  stateOverrides: Partial<SessionState> = {},
  dispatch: CommandSpy = () => {},
): void {
  const store = sessionStoreWith({ ...INITIAL_SESSION_STATE, ...stateOverrides }, dispatch)
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={client}>
      <SessionStoreContext.Provider value={store}>
        <Composer />
      </SessionStoreContext.Provider>
    </QueryClientProvider>,
  )
}

function textArea(): HTMLTextAreaElement {
  return screen.getByPlaceholderText(/依頼を書く/) as HTMLTextAreaElement
}

describe("Composer", () => {
  it("(1) Command+Enter で prompt が dispatch され、入力欄が空になる", () => {
    const calls: unknown[] = []
    renderComposer({}, (command) => calls.push(command))

    fireEvent.change(textArea(), { target: { value: "架空の依頼" } })
    fireEvent.keyDown(textArea(), { key: "Enter", metaKey: true })

    // 画像を添えていない依頼は、空の `images` を伴って送られる。
    expect(calls).toEqual([{ type: "prompt", text: "架空の依頼", images: [] }])
    expect(textArea().value).toBe("")
  })

  it("(2) Enter 単独・Shift+Enter は送らない（既定の改行のまま）", () => {
    const calls: unknown[] = []
    renderComposer({}, (command) => calls.push(command))

    fireEvent.change(textArea(), { target: { value: "架空の依頼" } })
    fireEvent.keyDown(textArea(), { key: "Enter" })
    fireEvent.keyDown(textArea(), { key: "Enter", shiftKey: true })

    expect(calls).toEqual([])
    expect(textArea().value).toBe("架空の依頼")
  })

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

  it("ターンが進行中の間に Command+Enter を押しても送らない（進行中は中断ボタンに切り替わる）", () => {
    const calls: unknown[] = []
    renderComposer({ turn: { kind: "running", startedAt: 0 } }, (command) => calls.push(command))

    fireEvent.change(textArea(), { target: { value: "架空の依頼" } })
    fireEvent.keyDown(textArea(), { key: "Enter", metaKey: true })

    expect(calls).toEqual([])
  })

  it("(6) / で候補が前方一致→部分一致の順に出て、Tab で確定し送信しない", () => {
    const calls: unknown[] = []
    renderComposer(
      {
        slashCommands: ["clear", "compact", "unclear"],
        commandDescriptions: [
          { name: "clear", description: "架空の説明（消す）" },
          { name: "compact", description: "架空の説明（まとめる）" },
          { name: "unclear", description: undefined },
        ],
      },
      (command) => calls.push(command),
    )

    fireEvent.change(textArea(), { target: { value: "/cl" } })

    // "cl" は clear が前方一致、unclear が部分一致（"cl" を含む）。
    const items = screen.getAllByRole("listitem")
    expect(items.map((item) => item.textContent)).toEqual(["/clear架空の説明（消す）", "/unclear"])

    fireEvent.keyDown(textArea(), { key: "Tab" })

    expect(textArea().value).toBe("/clear ")
    expect(calls).toEqual([])
  })

  it("(6) 候補は最大10件に絞る", () => {
    const commandDescriptions = Array.from({ length: 15 }, (_, index) => ({
      name: `cmd${String(index).padStart(2, "0")}`,
      description: undefined,
    }))
    renderComposer({ slashCommands: commandDescriptions.map((c) => c.name), commandDescriptions })

    fireEvent.change(textArea(), { target: { value: "/cmd" } })

    expect(screen.getAllByRole("listitem")).toHaveLength(10)
  })

  it("答え待ちがある間は候補を出さない", () => {
    renderComposer({
      slashCommands: ["clear"],
      commandDescriptions: [{ name: "clear", description: undefined }],
      pending: [{ kind: "permission", id: "ask-1", toolName: "Bash", input: {} }],
    })

    fireEvent.change(textArea(), { target: { value: "/cl" } })

    expect(screen.queryAllByRole("listitem")).toHaveLength(0)
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

  it("キャラクターの名前があるときは、プレースホルダにその名前が出る", () => {
    renderComposer({ character: FIXTURE_CHARACTER })

    expect(textArea().placeholder).toBe(
      "架空の名前への依頼を書く（Enter で改行、Command+Enter で送信、/ でコマンド補完、@ でファイル補完、画像は貼り付け）",
    )
  })

  it("キャラクターがまだ届いていない・名前が無いときは、名前を使わない言い方に落ちる", () => {
    renderComposer({ character: undefined })

    expect(textArea().placeholder).toBe(
      "依頼を書く（Enter で改行、Command+Enter で送信、/ でコマンド補完、@ でファイル補完、画像は貼り付け）",
    )
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
      "src/browser/features/dispatch/composer.tsx",
      "src/browser/features/dispatch/file-suggestions.tsx",
    ])

    fireEvent.keyDown(textArea(), { key: "Tab" })

    expect(textArea().value).toBe("@src/browser/features/dispatch/composer.tsx ")
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

    expect(fetchCalls).toEqual(["/repository-file?t="])
  })

  it("文の途中の @ を確定しても、前後に書いた文はそのまま残る", async () => {
    stubFileListFetch()
    renderComposer()

    fireEvent.change(textArea(), { target: { value: "これを見て @src/cli" } })
    await waitFor(() => {
      expect(screen.getAllByRole("listitem")).toHaveLength(1)
    })

    fireEvent.keyDown(textArea(), { key: "Tab" })

    expect(textArea().value).toBe("これを見て @src/cli.ts ")
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
    expect(fetchCalls).toEqual([])
  })

  it("答え待ちがある間は @ の候補も出さない", () => {
    stubFileListFetch()
    renderComposer({
      pending: [{ kind: "permission", id: "ask-1", toolName: "Bash", input: {} }],
    })

    fireEvent.change(textArea(), { target: { value: "@src" } })

    expect(screen.queryAllByRole("listitem")).toHaveLength(0)
    expect(fetchCalls).toEqual([])
  })
})
