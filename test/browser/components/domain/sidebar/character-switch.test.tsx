// キャラクターの切り替えの `<select>`（`character-switch.tsx`）。**帯の `session-info.tsx` と
// 雑談中の `profile-card.tsx` の両方が同じ部品を使う**（見た目と名前だけを渡す。`session-switch.tsx`
// と対）ので、選択肢・値・塞ぐ条件・送るコマンドはここで1回だけ測る。呼び出す側のテストは
// 自分が `CharacterSwitch` を正しく置いているかだけを見る。

import { afterEach, describe, expect, it } from "bun:test"

import { cleanup, fireEvent, render, screen } from "@testing-library/react"

import { CharacterSwitch } from "../../../../../src/browser/components/domain/sidebar/character-switch.tsx"
import { SessionStoreContext } from "../../../../../src/browser/stores/session.tsx"
import { FRAME_ERROR_REASON } from "../../../../../src/shared/frame.ts"
import {
  INITIAL_SESSION_STATE,
  type SessionState,
} from "../../../../../src/shared/session-state.ts"
import { characterInfo, characterPackEntry } from "../../../../fixture/character.ts"
import { type CommandSpy, sessionStoreWith } from "../../../session-store.ts"

afterEach(() => {
  cleanup()
})

const TWO_PACKS: SessionState["characterPacks"] = [
  characterPackEntry("fictional", "架空の精霊"),
  characterPackEntry("local", "架空の同居人"),
]

function renderSwitch(
  stateOverrides: Partial<SessionState>,
  dispatch: CommandSpy = () => {},
): void {
  const store = sessionStoreWith({ ...INITIAL_SESSION_STATE, ...stateOverrides }, dispatch)
  render(
    <SessionStoreContext.Provider value={store}>
      <CharacterSwitch
        id="character-switch-fixture"
        ariaLabel="架空のラベル"
        frameClassName="fixture-frame"
        className="fixture-select"
      />
    </SessionStoreContext.Provider>,
  )
}

function select(): HTMLSelectElement {
  const element = screen.getByLabelText("架空のラベル")
  if (!(element instanceof HTMLSelectElement)) {
    throw new Error("切り替えが <select> になっていない")
  }
  return element
}

describe("CharacterSwitch", () => {
  it("パックの一覧が届いていなければ何も描かない", () => {
    renderSwitch({ character: characterInfo() })

    expect(screen.queryByLabelText("架空のラベル")).toBeNull()
  })

  it("選択肢が1つでも出し、いまのパックを選択する", () => {
    renderSwitch({
      characterPacks: [characterPackEntry("tsukumo-spirit", "つくもの精霊")],
      character: characterInfo({ pack: "tsukumo-spirit" }),
    })

    expect(select().value).toBe("tsukumo-spirit")
    expect(select().options).toHaveLength(1)
  })

  it("いまのパックが一覧に無ければ先頭のパックへ倒す", () => {
    renderSwitch({
      characterPacks: TWO_PACKS,
      character: characterInfo({ pack: "not-in-list" }),
    })

    expect(select().value).toBe("fictional")
  })

  it("選ぶと switch-character を dispatch する", () => {
    const calls: unknown[] = []
    renderSwitch({ characterPacks: TWO_PACKS, character: characterInfo() }, (command) => {
      calls.push(command)
    })

    fireEvent.change(select(), { target: { value: "local" } })

    expect(calls).toEqual([{ type: "switch-character", name: "local" }])
  })

  it("ターン進行中は塞がり、理由をサーバと同じ定型文で見せる", () => {
    renderSwitch({
      turn: { kind: "running", startedAt: 0 },
      characterPacks: TWO_PACKS,
      character: characterInfo(),
    })

    expect(select().disabled).toBe(true)
    expect(select().title).toBe(FRAME_ERROR_REASON.switchDuringTurn)
  })

  it("ターンが終わると有効に戻る", () => {
    renderSwitch({
      turn: { kind: "idle" },
      characterPacks: TWO_PACKS,
      character: characterInfo(),
    })

    expect(select().disabled).toBe(false)
    expect(select().title).toBe("")
  })
})
