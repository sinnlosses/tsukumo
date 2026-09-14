import { afterEach, beforeEach, describe, expect, it } from "bun:test"

import { cleanup, render } from "@testing-library/react"

import {
  INITIAL_SESSION_STATE,
  type SessionRecord,
  type SessionState,
} from "../../../src/protocol/session-state.ts"
import { SessionContext, type SessionContextValue } from "../../../src/ui/app.tsx"
import { CharacterView } from "../../../src/ui/character-view/character-view.tsx"
import { TurnSelectionContext, type TurnSelectionValue } from "../../../src/ui/turn-selection.tsx"

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

/** ターンが1つも無い（タブも出ていない）ときの選択。今回を見ている扱いになる。 */
const NO_TURN_SELECTION: TurnSelectionValue = {
  activeTurnId: undefined,
  newestTurnId: undefined,
  selectTurn: () => {},
}

function renderCharacterView(
  stateOverrides: Partial<SessionState>,
  selection: TurnSelectionValue = NO_TURN_SELECTION,
): void {
  const value: SessionContextValue = {
    state: { ...INITIAL_SESSION_STATE, ...stateOverrides },
    connection: "open",
    dispatch: () => {},
  }
  render(
    <SessionContext.Provider value={value}>
      <TurnSelectionContext.Provider value={selection}>
        <CharacterView />
      </TurnSelectionContext.Provider>
    </SessionContext.Provider>,
  )
}

const request = (text: string): SessionRecord => ({ kind: "request", text })
const speech = (
  text: string,
  expression: "default" | "proud" | "flustered" = "default",
): SessionRecord => ({ kind: "speech", text, expression })

/** 通し番号 0 / 1 の2ターン分の記録（0 が過去、1 が今回）。 */
const TWO_TURN_RECORDS: readonly SessionRecord[] = [
  request("1つ目の依頼"),
  speech("1つ目のセリフA", "proud"),
  speech("1つ目のセリフB", "flustered"),
  request("2つ目の依頼"),
  speech("2つ目のセリフ", "default"),
]

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

  it("(1) 過去のターンを選ぶと、そのターンのセリフだけが吹き出しに出る", () => {
    renderCharacterView(
      { records: TWO_TURN_RECORDS, speeches: ["2つ目のセリフ"], character: FIXTURE_CHARACTER },
      { activeTurnId: 0, newestTurnId: 1, selectTurn: () => {} },
    )

    expect(
      [...document.querySelectorAll(".balloon")].map((balloon) => balloon.textContent),
    ).toEqual(["1つ目のセリフB", "1つ目のセリフA"])
    // 最新（そのターンの最後）の1件だけが濃い（吹き出しの規則は変えない）。
    expect(document.querySelector(".balloon")?.getAttribute("data-latest")).toBe("true")
  })

  it("(2) 今回のターンを選ぶと、従来どおり今のセリフが出る", () => {
    renderCharacterView(
      { records: TWO_TURN_RECORDS, speeches: ["2つ目のセリフ"], character: FIXTURE_CHARACTER },
      { activeTurnId: 1, newestTurnId: 1, selectTurn: () => {} },
    )

    expect(
      [...document.querySelectorAll(".balloon")].map((balloon) => balloon.textContent),
    ).toEqual(["2つ目のセリフ"])
  })

  it("(3) セリフが1件も無い過去のターンでも壊れず、そのターン向けの文言が出る", () => {
    const records: readonly SessionRecord[] = [
      request("1つ目の依頼"),
      request("2つ目の依頼"),
      speech("2つ目のセリフ"),
    ]

    expect(() =>
      renderCharacterView(
        { records, speeches: ["2つ目のセリフ"], character: FIXTURE_CHARACTER },
        { activeTurnId: 0, newestTurnId: 1, selectTurn: () => {} },
      ),
    ).not.toThrow()

    expect(document.querySelectorAll(".balloon")).toHaveLength(1)
    expect(document.querySelector(".balloon")?.textContent).toBe(
      "（このターンでは発話がありませんでした）",
    )
    expect(document.querySelector(".portrait")?.getAttribute("data-expression")).toBe("default")
  })

  it("過去のターンでは、そのターンの最後のセリフの表情になる（ツール実行中でも作業中に上書きしない）", () => {
    const now = 1_700_000_000_000
    const originalNow = Date.now
    Date.now = () => now
    try {
      renderCharacterView(
        {
          records: TWO_TURN_RECORDS,
          speeches: ["2つ目のセリフ"],
          speechExpression: "default",
          // 今回のターンでツールが動き続けていても、過去のターンの表情は上書きされない。
          runningTools: [
            { toolUseId: "toolu_1", name: "Read", input: {}, nested: false, startedAt: now - 5000 },
          ],
          character: {
            ...FIXTURE_CHARACTER,
            expressions: [
              { name: "default", label: "通常" },
              { name: "working", label: "作業中" },
              { name: "flustered", label: "あわてた" },
            ],
            portraits: {
              default: "/character/default.png",
              working: "/character/working.png",
              proud: undefined,
              flustered: "/character/flustered.png",
            },
          },
        },
        { activeTurnId: 0, newestTurnId: 1, selectTurn: () => {} },
      )

      expect(document.querySelector(".portrait")?.getAttribute("data-expression")).toBe("flustered")
      expect(document.querySelector(".portrait-image")?.getAttribute("src")).toBe(
        "/character/flustered.png",
      )
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
