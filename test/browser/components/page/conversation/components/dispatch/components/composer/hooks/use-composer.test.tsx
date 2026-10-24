import { act, cleanup, renderHook } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"

import {
  draftOnSessionChange,
  saveSessionDraft,
} from "../../../../../../../../../../src/browser/components/page/conversation/components/dispatch/components/composer/domain/composer-draft-storage.ts"
import { useComposer } from "../../../../../../../../../../src/browser/components/page/conversation/components/dispatch/components/composer/hooks/use-composer.ts"
import type { ComposerKey } from "../../../../../../../../../../src/browser/components/page/conversation/components/dispatch/domain/composer-surface.ts"
import {
  EMPTY_DRAFT,
  useComposerDraft,
} from "../../../../../../../../../../src/browser/components/page/conversation/stores/composer-draft.ts"
import { useInquiryDraft } from "../../../../../../../../../../src/browser/components/page/conversation/stores/inquiry-draft.ts"
import { useSession } from "../../../../../../../../../../src/browser/stores/session.ts"
import {
  INITIAL_SESSION_STATE,
  type SessionState,
} from "../../../../../../../../../../src/shared/session/session-state.ts"
import { characterInfo } from "../../../../../../../../../fixture/character.ts"
import { queryClientWrapper } from "../../../../../../../../query-client.tsx"
import {
  type CommandSpy,
  putSession,
  putState,
  stateWith,
} from "../../../../../../../../session-store.ts"

/**
 * `<Composer>` を描かずに、下書き・候補の出し分けと選択位置・キーの読み替え・送り先だけを測る
 * （docs/architecture.md「機能の中を分ける」）。`<textarea>` にどう並ぶかは別のテスト
 * （部品ごと描画する側）が確かめる。フィクスチャはすべて手で書いた架空のもの
 */

afterEach(() => {
  cleanup()
  localStorage.clear()
  // 組み立て中の答えはモジュール単位で残るので、次のテストへ持ち越さない。
  useInquiryDraft.setState(useInquiryDraft.getInitialState(), true)
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
    readonly shift?: boolean
  } = {},
): PressedKey {
  let prevented = false
  return {
    key: value,
    ctrlKey: modifiers.ctrl ?? false,
    metaKey: modifiers.meta ?? false,
    shiftKey: modifiers.shift ?? false,
    keyCode: 0,
    isComposing: false,
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

/** `sessionId` に保存してある打ちかけの文面（無ければ空文字）。画面を開いた直後に空の入力欄へ戻る下書きで読む。 */
function savedText(sessionId: string): string {
  return draftOnSessionChange(undefined, sessionId, EMPTY_DRAFT)?.text ?? ""
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

describe("useComposer の Escape（フォーカスを外す）", () => {
  function attachSurface(result: {
    readonly current: ReturnType<typeof useComposer>
  }): () => number {
    let blurred = 0
    result.current.surfaceRef.current = {
      focus: () => {},
      blur: () => {
        blurred += 1
      },
      caret: () => 0,
      placeCaret: () => {},
    }
    return () => blurred
  }

  it("補完が開いていなければ、フォーカスを外して処理済みにする", () => {
    const { result } = renderUseComposer()
    const blurredCount = attachSurface(result)
    type(result, "架空の依頼")

    act(() => {
      expect(result.current.onKeyDown(key("Escape"))).toBe(true)
    })

    expect(blurredCount()).toBe(1)
  })

  it("補完が開いている間は候補を閉じるだけで外さず、次の Escape で外す", () => {
    const { result } = renderUseComposer(FIXTURE_COMMANDS)
    const blurredCount = attachSurface(result)
    type(result, "/cl")

    press(result, key("Escape"))
    expect(blurredCount()).toBe(0)

    press(result, key("Escape"))
    expect(blurredCount()).toBe(1)
  })

  it("変換中と修飾キー付きでは外さない", () => {
    const { result } = renderUseComposer()
    const blurredCount = attachSurface(result)

    press(result, { ...key("Escape"), isComposing: true })
    press(result, { ...key("Escape"), keyCode: 229 })
    press(result, key("Escape", { shift: true }))

    expect(blurredCount()).toBe(0)
  })
})

describe("useComposer の送信", () => {
  it("Command+Enter で前後の空白を落として送り、下書きを空にする", () => {
    const calls: unknown[] = []
    const { result } = renderUseComposer({}, (command) => calls.push(command))
    type(result, "  架空の依頼  ")

    expect(press(result, key("Enter", { meta: true })).prevented()).toBe(true)

    expect(calls).toEqual([
      {
        procedure: "session.prompt",
        text: "架空の依頼",
        images: [],
        routing: "aside-when-background",
      },
    ])
    expect(result.current.draft.text).toBe("")
  })

  it("Command+Shift+Enter は新しい依頼として送り、フォームの送信は Command+Enter と同じ送り方", () => {
    const calls: unknown[] = []
    const { result } = renderUseComposer({}, (command) => calls.push(command))
    type(result, "架空の新しい依頼")
    expect(press(result, key("Enter", { meta: true, shift: true })).prevented()).toBe(true)
    type(result, "架空のボタンの依頼")
    act(() => {
      result.current.onSubmit({ preventDefault: () => {} })
    })

    expect(calls).toEqual([
      {
        procedure: "session.prompt",
        text: "架空の新しい依頼",
        images: [],
        routing: "new-request",
      },
      {
        procedure: "session.prompt",
        text: "架空のボタンの依頼",
        images: [],
        routing: "aside-when-background",
      },
    ])
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

  it("接続が切れている間は Command+Enter もフォームの送信も送らず、下書きと添付画像を残す", () => {
    const calls: unknown[] = []
    const { result } = renderUseComposer({}, (command) => calls.push(command))
    type(result, "架空の依頼")
    act(() => {
      useSession.getState().setConnection("closed")
    })

    press(result, key("Enter", { meta: true }))
    act(() => {
      result.current.onSubmit({ preventDefault: () => {} })
    })

    expect(calls).toEqual([])
    expect(result.current.draft.text).toBe("架空の依頼")
    expect(result.current.band.kind).toBe("disconnected")
  })

  it("会話が終わったあとは帯に終了の旨と口を出し、送らず下書きを残す。口は新しいセッションを頼む", () => {
    const calls: { readonly procedure: string }[] = []
    const { result } = renderUseComposer({ endedReason: "架空の理由" }, (command) =>
      calls.push(command),
    )
    type(result, "架空の依頼")

    press(result, key("Enter", { meta: true }))
    act(() => {
      result.current.onSubmit({ preventDefault: () => {} })
    })

    expect(calls).toEqual([])
    expect(result.current.draft.text).toBe("架空の依頼")
    const band = result.current.band
    expect(band.kind).toBe("ended")
    expect(band.kind === "ended" && band.text).toContain("架空の理由")

    act(() => {
      if (band.kind === "ended") {
        band.onRestart()
      }
    })

    expect(calls).toEqual([{ procedure: "session.startNewSession" }])
  })

  it("切断の帯は終了の帯より先に出す", () => {
    const { result } = renderUseComposer({ endedReason: "架空の理由" })
    act(() => {
      useSession.getState().setConnection("closed")
    })

    expect(result.current.band.kind).toBe("disconnected")
  })

  it("初回の接続中は帯を出さず、切れたあと繋ぎ直している間は出し続け、開いたら消す", () => {
    const { result } = renderUseComposer()
    act(() => {
      useSession.getState().setConnection("connecting")
    })
    expect(result.current.band.kind).toBe("none")

    act(() => {
      useSession.getState().setConnection("closed")
    })
    act(() => {
      useSession.getState().setConnection("connecting")
    })
    expect(result.current.band.kind).toBe("disconnected")

    act(() => {
      useSession.getState().setConnection("open")
    })
    expect(result.current.band.kind).toBe("none")
  })
})

describe("useComposer の打ちかけの保存", () => {
  const identified = (sessionId: string): SessionState =>
    stateWith({ session: { kind: "identified", sessionId } })
  const startingState = stateWith({ session: { kind: "starting" } })

  it("A から B へ変わると A の打ちかけを A に保ち、入力欄を B の下書き（無ければ空）にする", () => {
    const { result } = renderUseComposer(identified("a"))
    type(result, "Aの打ちかけ")

    act(() => {
      putState(identified("b"))
    })
    expect(result.current.draft.text).toBe("")

    act(() => {
      putState(identified("a"))
    })
    expect(result.current.draft.text).toBe("Aの打ちかけ")
  })

  it("新しいセッション（A から未確定を経て B）でも A の打ちかけは B に残らない", () => {
    const { result } = renderUseComposer(identified("a"))
    type(result, "Aの打ちかけ")

    act(() => {
      putState(startingState)
    })
    act(() => {
      putState(identified("b"))
    })
    expect(result.current.draft.text).toBe("")

    act(() => {
      putState(identified("a"))
    })
    expect(result.current.draft.text).toBe("Aの打ちかけ")
  })

  it("A から未確定に変わると入力欄を空にして A の打ちかけを A に保ち、A に戻ると戻る", () => {
    const { result } = renderUseComposer(identified("a"))
    type(result, "Aの打ちかけ")

    act(() => {
      putState(startingState)
    })
    expect(result.current.draft.text).toBe("")
    expect(savedText("a")).toBe("Aの打ちかけ")

    act(() => {
      putState(identified("a"))
    })
    expect(result.current.draft.text).toBe("Aの打ちかけ")
  })

  it("未確定のあいだに打った字は A に保たれず、決まった B のものになる", () => {
    const { result } = renderUseComposer(identified("a"))
    type(result, "Aの打ちかけ")
    act(() => {
      putState(startingState)
    })
    type(result, "Bのための字")

    act(() => {
      putState(identified("b"))
    })
    expect(result.current.draft.text).toBe("Bのための字")
    expect(savedText("a")).toBe("Aの打ちかけ")
  })

  it("未確定のあいだに送って空のまま B が決まっても、A の保存済みは消えない", () => {
    const { result } = renderUseComposer(identified("a"))
    type(result, "Aの打ちかけ")
    act(() => {
      putState(startingState)
    })
    type(result, "送る字")
    press(result, key("Enter", { meta: true }))
    act(() => {
      putState(identified("b"))
    })

    expect(result.current.draft.text).toBe("")
    expect(savedText("a")).toBe("Aの打ちかけ")
  })

  it("最初にセッションが決まったとき、入力欄が空なら保存済みを戻す", () => {
    saveSessionDraft("a", { text: "保存済み", caret: 2 })
    const { result } = renderUseComposer(startingState)
    act(() => {
      putState(identified("a"))
    })
    expect(result.current.draft).toEqual({ text: "保存済み", caret: 2 })
  })

  it("最初にセッションが決まったとき、入力欄に字があれば触らない", () => {
    saveSessionDraft("a", { text: "保存済み", caret: 2 })
    const { result } = renderUseComposer(startingState)
    type(result, "いま打った字")
    act(() => {
      putState(identified("a"))
    })
    expect(result.current.draft.text).toBe("いま打った字")
  })
})
