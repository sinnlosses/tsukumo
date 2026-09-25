import { afterEach, describe, expect, it } from "bun:test"

import { act, cleanup, renderHook } from "@testing-library/react"
import { type ReactElement, type ReactNode } from "react"

import { useCharacterCreate } from "../../../../../../../../src/browser/components/page/character/components/character-create/hooks/use-character-create.ts"
import {
  type SessionStore,
  SessionStoreContext,
} from "../../../../../../../../src/browser/stores/session.tsx"
import { type CharacterPackEntry } from "../../../../../../../../src/shared/character.ts"
import {
  INITIAL_SESSION_STATE,
  type SessionState,
} from "../../../../../../../../src/shared/session-state.ts"
import { characterPackEntry } from "../../../../../../../fixture/character.ts"
import { type CommandSpy, putState, sessionStoreWith } from "../../../../../../session-store.ts"

/**
 * ダイアログを描かずに、押せるか・id の欄の下の一言・作る／自動で閉じて選ぶ、の送り先だけを
 * 測る（docs/design.md 2章「機能の中を分ける」）。画面に出た形と「やめる」・Esc・backdrop での
 * 閉じ方は `character-create.test.tsx`。フィクスチャはすべて手で書いた架空のもの
 * （docs/coding-standards.md「会話内容の扱い」）。
 */

const FIXTURE_PACKS: readonly CharacterPackEntry[] = [characterPackEntry("fictional", "架空の精霊")]

const BASE_STATE: SessionState = {
  ...INITIAL_SESSION_STATE,
  characterPacks: FIXTURE_PACKS,
}

afterEach(() => {
  cleanup()
  window.location.hash = ""
})

function wrapperOf(store: SessionStore): (props: { readonly children: ReactNode }) => ReactElement {
  return function Wrapper({ children }: { readonly children: ReactNode }): ReactElement {
    return <SessionStoreContext.Provider value={store}>{children}</SessionStoreContext.Provider>
  }
}

function renderUseCharacterCreate(
  state: SessionState,
  onClose: () => void = () => {},
  spy: CommandSpy = () => {},
) {
  const store = sessionStoreWith(state, spy)
  const hook = renderHook(() => useCharacterCreate(true, onClose), { wrapper: wrapperOf(store) })
  return { store, hook }
}

/** 必須の立ち絵を選ぶ（`FileReader` は非同期なので、読み終わって state が変わるまで待つ）。 */
async function pickPortrait(onPick: (input: HTMLInputElement) => void): Promise<void> {
  const input = document.createElement("input")
  input.type = "file"
  Object.defineProperty(input, "files", {
    value: [new File(["<svg/>"], "picked.svg", { type: "image/svg+xml" })],
  })
  await act(async () => {
    onPick(input)
    await new Promise((resolve) => setTimeout(resolve, 20))
  })
}

describe("useCharacterCreate", () => {
  it("id が空・形が合う・崩れているで id の欄の下の一言が決まる", () => {
    const { hook } = renderUseCharacterCreate(BASE_STATE)

    expect(hook.result.current.form.idNote.kind).toBe("hint")

    act(() => {
      hook.result.current.form.onIdChange("../escape")
    })
    expect(hook.result.current.form.idNote).toEqual({
      kind: "invalid",
      text: "id に使えるのは半角の英数字と . _ - だけ（. では始められない）",
    })
    expect(hook.result.current.form.canSubmit).toBe(false)

    act(() => {
      hook.result.current.form.onIdChange("fictional")
    })
    expect(hook.result.current.form.idNote).toEqual({
      kind: "taken",
      text: "その id はもう使われている",
    })

    act(() => {
      hook.result.current.form.onIdChange("fictional-2")
    })
    expect(hook.result.current.form.idNote.kind).toBe("hint")
    // id は良いが、必須の立ち絵がまだ無い。
    expect(hook.result.current.form.canSubmit).toBe(false)
  })

  it("必須の立ち絵を選ぶと押せるようになる", async () => {
    const { hook } = renderUseCharacterCreate(BASE_STATE)

    act(() => {
      hook.result.current.form.onIdChange("fictional-2")
    })
    expect(hook.result.current.form.canSubmit).toBe(false)

    await pickPortrait(hook.result.current.form.portrait.onPick)

    expect(hook.result.current.form.canSubmit).toBe(true)
    expect(hook.result.current.form.portrait.image.kind).toBe("picked")
  })

  it("作ると characterPack.create を送り、一覧に出たら閉じて一覧でそのパックを選ぶ", async () => {
    const calls: unknown[] = []
    const closed: string[] = []
    const { hook, store } = renderUseCharacterCreate(
      BASE_STATE,
      () => closed.push("closed"),
      (command) => calls.push(command),
    )
    act(() => {
      hook.result.current.form.onNameChange("架空の2号")
      hook.result.current.form.onIdChange("fictional-2")
      hook.result.current.form.workAccent.onChange("#22ff88")
      hook.result.current.form.chatAccent.onChange("#ff8822")
    })
    await pickPortrait(hook.result.current.form.portrait.onPick)

    act(() => {
      hook.result.current.form.onSubmit()
    })
    expect(calls).toEqual([
      {
        procedure: "characterPack.create",
        id: "fictional-2",
        name: "架空の2号",
        portraits: {
          default: `data:image/svg+xml;base64,${Buffer.from("<svg/>").toString("base64")}`,
        },
        accent: "#22ff88",
        chatAccent: "#ff8822",
      },
    ])
    // まだ一覧に出ていないので、閉じない。
    expect(closed).toEqual([])

    act(() => {
      putState(store, {
        ...BASE_STATE,
        characterPacks: [...FIXTURE_PACKS, characterPackEntry("fictional-2", "fictional-2")],
      })
    })

    expect(closed).toEqual(["closed"])
    expect(window.location.hash).toBe("#character?pack=fictional-2")
  })
})
