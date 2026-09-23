import { afterEach, describe, expect, it } from "bun:test"

import { act, cleanup, renderHook } from "@testing-library/react"
import { type ReactElement, type ReactNode } from "react"

import {
  type CharacterCreateModel,
  useCharacterCreate,
} from "../../../../src/browser/features/character-screen/hooks/use-character-create.ts"
import { type SessionStore, SessionStoreContext } from "../../../../src/browser/stores/session.tsx"
import { type CharacterPackEntry } from "../../../../src/shared/character.ts"
import { FRAME_ERROR_REASON } from "../../../../src/shared/frame.ts"
import { INITIAL_SESSION_STATE, type SessionState } from "../../../../src/shared/session-state.ts"
import { characterInfo, characterPackEntry } from "../../../fixture/character.ts"
import { type CommandSpy, putState, sessionStoreWith } from "../../session-store.ts"

/**
 * 作る画面（`<CharacterCreate>`）を描かずに、押せるか・名前の下の一言・作る／切り替えるの
 * 送り先だけを測る（docs/design.md 2章「機能の中を分ける」）。画面に出た形は
 * `character-create.test.tsx`。フィクスチャはすべて手で書いた架空のもの
 * （docs/coding-standards.md「会話内容の扱い」）。
 */

const FIXTURE_CHARACTER: NonNullable<SessionState["character"]> = characterInfo({
  expressions: [{ name: "default", label: "通常" }],
})

const FIXTURE_PACKS: readonly CharacterPackEntry[] = [characterPackEntry("fictional", "架空の精霊")]

const BASE_STATE: SessionState = {
  ...INITIAL_SESSION_STATE,
  character: FIXTURE_CHARACTER,
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

function renderUseCharacterCreate(state: SessionState, spy: CommandSpy = () => {}) {
  const store = sessionStoreWith(state, spy)
  const hook = renderHook(() => useCharacterCreate(), { wrapper: wrapperOf(store) })
  return { store, hook }
}

function form(
  model: CharacterCreateModel,
): Extract<CharacterCreateModel["form"], { kind: "ready" }> {
  if (model.form.kind !== "ready") {
    throw new Error("口がまだ決まっていない")
  }
  return model.form
}

/** 必須の1枚を選ぶ（`FileReader` は非同期なので、読み終わって state が変わるまで待つ）。 */
async function pickDefault(model: CharacterCreateModel): Promise<void> {
  const input = document.createElement("input")
  input.type = "file"
  Object.defineProperty(input, "files", {
    value: [new File(["<svg/>"], "picked.svg", { type: "image/svg+xml" })],
  })
  await act(async () => {
    form(model).portraitFields[0]?.onPick(input)
    await new Promise((resolve) => setTimeout(resolve, 20))
  })
}

describe("useCharacterCreate", () => {
  it("キャラクターが届く前は戻る口だけを返す", () => {
    const { hook } = renderUseCharacterCreate({ ...BASE_STATE, character: undefined })

    expect(hook.result.current).toEqual({ backHref: "#character", form: { kind: "waiting" } })
  })

  it("必須の立ち絵の欄は1つで、ラベルはいまのパックの言葉を借りる", () => {
    const { hook } = renderUseCharacterCreate(BASE_STATE)

    expect(
      form(hook.result.current).portraitFields.map(({ expression, inputId, label }) => ({
        expression,
        inputId,
        label,
      })),
    ).toEqual([
      {
        expression: "default",
        inputId: "character-create-portrait-default",
        label: "通常の立ち絵",
      },
    ])
  })

  it("名前の形・使われているか・必須の1枚で押せるかと一言が決まる", async () => {
    const { hook } = renderUseCharacterCreate(BASE_STATE)
    const typeName = (name: string) => {
      act(() => {
        form(hook.result.current).onNameChange(name)
      })
    }

    expect(form(hook.result.current).note).toEqual({ kind: "none" })
    typeName("../escape")
    expect(form(hook.result.current).note).toMatchObject({ kind: "message" })
    expect(form(hook.result.current).canSubmit).toBe(false)

    typeName("fictional")
    expect(form(hook.result.current).note).toEqual({
      kind: "message",
      text: "その名前はもう使われている",
    })

    typeName("fictional-2")
    expect(form(hook.result.current).note).toEqual({ kind: "none" })
    // 名前は良いが、必須の1枚がまだ無い。
    expect(form(hook.result.current).canSubmit).toBe(false)

    await pickDefault(hook.result.current)
    expect(form(hook.result.current).canSubmit).toBe(true)
  })

  it("作ると create-character を送り、一覧に出たら切り替える口を返す", async () => {
    const calls: unknown[] = []
    const { hook, store } = renderUseCharacterCreate(
      { ...BASE_STATE, turn: { kind: "running", startedAt: 0 } },
      (command) => calls.push(command),
    )
    act(() => {
      form(hook.result.current).onNameChange("fictional-2")
      form(hook.result.current).onAccentChange("#22ff88")
    })
    await pickDefault(hook.result.current)

    act(() => {
      form(hook.result.current).onSubmit()
    })
    expect(calls).toEqual([
      {
        type: "create-character",
        id: "fictional-2",
        name: "",
        portraits: {
          default: `data:image/svg+xml;base64,${Buffer.from("<svg/>").toString("base64")}`,
        },
        accent: "#22ff88",
        chatAccent: "#22ff88",
      },
    ])
    // まだ一覧に出ていないので、作れたとは言わない。
    expect(form(hook.result.current).note).toEqual({ kind: "none" })

    act(() => {
      putState(store, {
        ...BASE_STATE,
        characterPacks: [...FIXTURE_PACKS, characterPackEntry("fictional-2", "fictional-2")],
        turn: { kind: "running", startedAt: 0 },
      })
    })
    const note = form(hook.result.current).note
    if (note.kind !== "created") {
      throw new Error("作れたことになっていない")
    }
    // ターン進行中は押せず、理由はサーバが断るときと同じ文言。
    expect(note.switchDisabled).toBe(true)
    expect(note.switchTitle).toBe(FRAME_ERROR_REASON.switchDuringTurn)
    expect(form(hook.result.current).canSubmit).toBe(false)

    act(() => {
      note.onSwitch()
    })
    expect(calls.at(-1)).toEqual({ type: "switch-character", name: "fictional-2" })
    expect(window.location.hash).toBe("#character")
  })
})
