import { afterEach, beforeEach, describe, expect, it } from "bun:test"

import { cleanup, render } from "@testing-library/react"

import { INITIAL_SESSION_STATE, type SessionState } from "../../../src/protocol/session-state.ts"
import { SessionContext, type SessionContextValue } from "../../../src/ui/app.tsx"
import { CharacterView } from "../../../src/ui/character-view/character-view.tsx"

// フィクスチャはすべて手で書いた架空のキャラクター定義・セリフ（docs/coding-standards.md「会話内容の扱い」）。

const PORTRAIT_FIXED_STORAGE_KEY = "tsukumo-portrait-fixed"

const FIXTURE_CHARACTER: NonNullable<SessionState["character"]> = {
  pack: "fictional",
  name: "架空の精霊",
  accent: undefined,
  speechMarker: undefined,
  expressions: [{ name: "default", label: "通常" }],
  portraits: {
    default: "/character/default.png",
    working: undefined,
    proud: undefined,
    flustered: undefined,
  },
  outfitAccents: {
    default: undefined,
    light: undefined,
    normal: undefined,
    heavy: undefined,
  },
}

beforeEach(() => {
  localStorage.removeItem(PORTRAIT_FIXED_STORAGE_KEY)
})

afterEach(() => {
  cleanup()
  localStorage.removeItem(PORTRAIT_FIXED_STORAGE_KEY)
})

function renderCharacterView(stateOverrides: Partial<SessionState>): void {
  const value: SessionContextValue = {
    state: { ...INITIAL_SESSION_STATE, ...stateOverrides },
    connection: "open",
    dispatch: () => {},
  }
  render(
    <SessionContext.Provider value={value}>
      <CharacterView />
    </SessionContext.Provider>,
  )
}

describe("CharacterView", () => {
  it("(3) 立ち絵の URL が無い（character が undefined）ときは、吹き出しだけが出て落ちない", () => {
    expect(() =>
      renderCharacterView({ character: undefined, speeches: ["やあ、調子はどう？"] }),
    ).not.toThrow()

    expect(document.querySelector(".portrait")).toBeNull()
    expect(document.querySelector(".balloon-track")).not.toBeNull()
    expect(document.querySelector(".balloon")?.textContent).toBe("やあ、調子はどう？")
  })

  it("(4) 実行中のツールが作業中の遅延（1秒）を超えていれば、表情が working になる（偽の時計）", () => {
    const now = 1_700_000_000_000
    const originalNow = Date.now
    Date.now = () => now
    try {
      renderCharacterView({
        speechExpression: "default",
        runningTools: [
          { toolUseId: "toolu_1", name: "Read", input: {}, nested: false, startedAt: now - 2000 },
        ],
        character: {
          ...FIXTURE_CHARACTER,
          expressions: [
            { name: "default", label: "通常" },
            { name: "working", label: "作業中" },
          ],
          portraits: {
            default: "/character/default.png",
            working: "/character/working.png",
            proud: undefined,
            flustered: undefined,
          },
          outfitAccents: {
            default: undefined,
            light: undefined,
            normal: undefined,
            heavy: undefined,
          },
        },
      })

      expect(document.querySelector(".portrait")?.getAttribute("data-expression")).toBe("working")
      expect(document.querySelector(".portrait-image")?.getAttribute("src")).toBe(
        "/character/working.png",
      )
    } finally {
      Date.now = originalNow
    }
  })

  it("実行中のツールが遅延をまだ超えていなければ、直近のセリフの表情のまま", () => {
    const now = 1_700_000_000_000
    const originalNow = Date.now
    Date.now = () => now
    try {
      renderCharacterView({
        speechExpression: "proud",
        runningTools: [
          { toolUseId: "toolu_1", name: "Read", input: {}, nested: false, startedAt: now - 100 },
        ],
        character: {
          ...FIXTURE_CHARACTER,
          expressions: [
            { name: "default", label: "通常" },
            { name: "proud", label: "どや顔" },
          ],
          portraits: {
            default: "/character/default.png",
            working: undefined,
            proud: "/character/proud.png",
            flustered: undefined,
          },
          outfitAccents: {
            default: undefined,
            light: undefined,
            normal: undefined,
            heavy: undefined,
          },
        },
      })

      expect(document.querySelector(".portrait")?.getAttribute("data-expression")).toBe("proud")
    } finally {
      Date.now = originalNow
    }
  })

  it("ターンが進行中でなく、直近の完了・失敗も無ければ data-motion は reading（呼吸だけ）", () => {
    renderCharacterView({
      character: FIXTURE_CHARACTER,
      turnInProgress: false,
      turnFinishedAt: undefined,
      lastToolFailureAt: undefined,
    })

    expect(document.querySelector(".portrait")?.getAttribute("data-motion")).toBe("reading")
  })

  it("ターンが進行中なら data-motion は waiting（領域の中を歩く）", () => {
    renderCharacterView({
      character: FIXTURE_CHARACTER,
      turnInProgress: true,
      turnFinishedAt: undefined,
      lastToolFailureAt: undefined,
    })

    expect(document.querySelector(".portrait")?.getAttribute("data-motion")).toBe("waiting")
  })

  it("ターンが終わった直後は data-motion が success（完了の反応。偽の時計）", () => {
    const now = 1_700_000_000_000
    const originalNow = Date.now
    Date.now = () => now
    try {
      renderCharacterView({
        character: FIXTURE_CHARACTER,
        turnInProgress: false,
        turnFinishedAt: now - 100,
        lastToolFailureAt: undefined,
      })

      expect(document.querySelector(".portrait")?.getAttribute("data-motion")).toBe("success")
    } finally {
      Date.now = originalNow
    }
  })

  it("ツールが失敗した直後は data-motion が failure（失敗でびくっ。偽の時計）", () => {
    const now = 1_700_000_000_000
    const originalNow = Date.now
    Date.now = () => now
    try {
      renderCharacterView({
        character: FIXTURE_CHARACTER,
        turnInProgress: true,
        turnFinishedAt: undefined,
        lastToolFailureAt: now - 100,
      })

      expect(document.querySelector(".portrait")?.getAttribute("data-motion")).toBe("failure")
    } finally {
      Date.now = originalNow
    }
  })

  it("「固定」を localStorage に入れていると data-motion 属性ごと省略する（動かない）", () => {
    localStorage.setItem(PORTRAIT_FIXED_STORAGE_KEY, "true")

    renderCharacterView({
      character: FIXTURE_CHARACTER,
      turnInProgress: true,
      turnFinishedAt: undefined,
      lastToolFailureAt: undefined,
    })

    expect(document.querySelector(".portrait")?.hasAttribute("data-motion")).toBe(false)
  })
})
