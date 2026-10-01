import { act, cleanup, renderHook } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"

import { useComposer } from "../../../../../../../../../../src/browser/components/page/conversation/components/dispatch/components/composer/hooks/use-composer.ts"
import type { ComposerKey } from "../../../../../../../../../../src/browser/components/page/conversation/components/dispatch/domain/composer-surface.ts"
import { useComposerDraft } from "../../../../../../../../../../src/browser/stores/composer-draft.ts"
import { useQuestionDraft } from "../../../../../../../../../../src/browser/stores/question-answer.ts"
import {
  INITIAL_SESSION_STATE,
  type SessionState,
} from "../../../../../../../../../../src/shared/session/session-state.ts"
import { characterInfo } from "../../../../../../../../../fixture/character.ts"
import { queryClientWrapper } from "../../../../../../../../query-client.tsx"
import { type CommandSpy, putSession } from "../../../../../../../../session-store.ts"

/**
 * `<Composer>` を描かずに、下書き・候補の出し分けと選択位置・キーの読み替え・送り先だけを測る
 * （docs/architecture.md「機能の中を分ける」）。`<textarea>` にどう並ぶかは別のテスト
 * （部品ごと描画する側）が確かめる。フィクスチャはすべて手で書いた架空のもの
 */

afterEach(() => {
  cleanup()
  // 組み立て中の答えはモジュール単位で残るので、次のテストへ持ち越さない。
  useQuestionDraft.setState(useQuestionDraft.getInitialState(), true)
  useComposerDraft.setState(useComposerDraft.getInitialState(), true)
})

const FIXTURE_COMMANDS = {
  slashCommands: ["clear", "compact", "unclear"],
  commandDescriptions: [
    { name: "clear", description: "架空の説明（消す）" },
    { name: "compact", description: "架空の説明（まとめる）" },
    { name: "unclear", description: undefined },
  ],
} satisfies Partial<SessionState>

function renderUseComposer(
  stateOverrides: Partial<SessionState> = {},
  spy: CommandSpy = () => {},
): { readonly result: { readonly current: ReturnType<typeof useComposer> } } {
  putSession({ ...INITIAL_SESSION_STATE, ...stateOverrides }, spy)
  const { result } = renderHook(() => useComposer(), { wrapper: queryClientWrapper() })
  return { result }
}

/** 打った文面（キャレットは既定で末尾）。 */
function type(
  result: { readonly current: ReturnType<typeof useComposer> },
  value: string,
  caret = value.length,
): void {
  act(() => {
    result.current.onChange({ text: value, caret })
  })
}

type PressedKey = ComposerKey & { readonly prevented: () => boolean }

function key(
  value: string,
  modifiers: {
    readonly ctrl?: boolean
    readonly meta?: boolean
    readonly composing?: boolean
  } = {},
  keyCode = 0,
): PressedKey {
  let prevented = false
  return {
    key: value,
    ctrlKey: modifiers.ctrl ?? false,
    metaKey: modifiers.meta ?? false,
    keyCode,
    isComposing: modifiers.composing ?? false,
    preventDefault: () => {
      prevented = true
    },
    prevented: () => prevented,
  }
}

function press(
  result: { readonly current: ReturnType<typeof useComposer> },
  pressed: PressedKey,
): PressedKey {
  act(() => {
    result.current.onKeyDown(pressed)
  })
  return pressed
}

describe("useComposer のプレースホルダ", () => {
  it("キャラクターの名前があれば依頼先に入れ、無ければ名前を使わない", () => {
    const named = renderUseComposer({
      character: characterInfo({
        pack: "架空パック",
        name: "架空の名前",
        expressions: [],
        editable: false,
      }),
    })
    expect(named.result.current.placeholder.startsWith("架空の名前 への依頼を書く")).toBe(true)

    const unnamed = renderUseComposer()
    expect(unnamed.result.current.placeholder.startsWith("依頼を書く")).toBe(true)
  })
})

describe("useComposer の `/` 補完", () => {
  it("↓・Ctrl+N で次へ、↑・Ctrl+P で前へ回る。Meta 併用の Ctrl+N は見ない", () => {
    const { result } = renderUseComposer(FIXTURE_COMMANDS)
    type(result, "/cl")

    expect(press(result, key("ArrowDown")).prevented()).toBe(true)
    expect(result.current.selectedIndex).toBe(1)
    press(result, key("n", { ctrl: true }))
    expect(result.current.selectedIndex).toBe(0)
    press(result, key("p", { ctrl: true }))
    expect(result.current.selectedIndex).toBe(1)
    press(result, key("ArrowUp"))
    expect(result.current.selectedIndex).toBe(0)

    expect(press(result, key("n", { ctrl: true, meta: true })).prevented()).toBe(false)
    expect(result.current.selectedIndex).toBe(0)
  })

  it("Tab で選んでいる候補を確定し、送らない", () => {
    const calls: unknown[] = []
    const { result } = renderUseComposer(FIXTURE_COMMANDS, (command) => calls.push(command))
    type(result, "/cl")
    press(result, key("ArrowDown"))

    expect(press(result, key("Tab")).prevented()).toBe(true)

    expect(result.current.draft.text).toBe("/unclear ")
    expect(result.current.suggestions.kind).toBe("none")
    expect(calls).toEqual([])
  })

  it("Escape で閉じ、打ち直すとまた開く", () => {
    const { result } = renderUseComposer(FIXTURE_COMMANDS)
    type(result, "/cl")

    press(result, key("Escape"))
    expect(result.current.suggestions.kind).toBe("none")

    type(result, "/c")
    expect(result.current.suggestions.kind).toBe("command")
  })
})

describe("useComposer の送信", () => {
  it("Command+Enter で前後の空白を落として送り、下書きを空にする", () => {
    const calls: unknown[] = []
    const { result } = renderUseComposer({}, (command) => calls.push(command))
    type(result, "  架空の依頼  ")

    expect(press(result, key("Enter", { meta: true })).prevented()).toBe(true)

    expect(calls).toEqual([{ procedure: "session.prompt", text: "架空の依頼", images: [] }])
    expect(result.current.draft.text).toBe("")
  })

  it("Enter 単独・IME の変換確定（isComposing / keyCode 229）では送らない", () => {
    const calls: unknown[] = []
    const { result } = renderUseComposer({}, (command) => calls.push(command))
    type(result, "架空の依頼")

    expect(press(result, key("Enter")).prevented()).toBe(false)
    press(result, key("Enter", { meta: true, composing: true }))
    press(result, key("Enter", { meta: true }, 229))

    expect(calls).toEqual([])
    expect(result.current.draft.text).toBe("架空の依頼")
  })

  it("空白だけの下書きは送らない", () => {
    const calls: unknown[] = []
    const { result } = renderUseComposer({}, (command) => calls.push(command))
    type(result, "   ")

    press(result, key("Enter", { meta: true }))

    expect(calls).toEqual([])
  })

  it("ターンの進行中は Command+Enter もフォームの送信も送らない（既定の動作は止める）", () => {
    const calls: unknown[] = []
    const { result } = renderUseComposer({ turn: { kind: "running", startedAt: 0 } }, (command) =>
      calls.push(command),
    )
    type(result, "架空の依頼")

    expect(press(result, key("Enter", { meta: true })).prevented()).toBe(true)
    let submitPrevented = false
    act(() => {
      result.current.onSubmit({
        preventDefault: () => {
          submitPrevented = true
        },
      })
    })

    expect(submitPrevented).toBe(true)
    expect(calls).toEqual([])
    expect(result.current.draft.text).toBe("架空の依頼")
  })
})
