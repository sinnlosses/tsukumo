import { afterEach, describe, expect, it, spyOn } from "bun:test"

import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { cleanup, render } from "@testing-library/react"

import { CharacterView } from "../../../../src/browser/features/character-view/character-view.tsx"
import { SessionStoreContext } from "../../../../src/browser/stores/session.tsx"
import {
  TurnSelectionContext,
  type TurnSelectionValue,
} from "../../../../src/browser/stores/turn-selection.tsx"
import {
  INITIAL_SESSION_STATE,
  type SessionRecord,
  type SessionState,
} from "../../../../src/shared/session-state.ts"
import { characterInfo, shownPortraits } from "../../../fixture/character.ts"
import { sessionStoreWith } from "../../session-store.ts"

// フィクスチャはすべて手で書いた架空のキャラクター定義・セリフ（docs/coding-standards.md「会話内容の扱い」）。

const FIXTURE_CHARACTER: NonNullable<SessionState["character"]> = characterInfo({
  ...shownPortraits({ default: "/character/default.png" }),
})

afterEach(() => {
  cleanup()
})

/** ターンが1つも無い（タブも出ていない）ときの選択。今回を見ている扱いになる。 */
const NO_TURN_SELECTION: TurnSelectionValue = {
  activeTurnId: undefined,
  newestTurnId: undefined,
  selectTurn: () => {},
}

// `<CharacterView>` は立ち絵に `<Portrait>`（`useQuery`）を使うので `QueryClientProvider` が要る。
function renderCharacterView(
  stateOverrides: Partial<SessionState>,
  selection: TurnSelectionValue = NO_TURN_SELECTION,
): void {
  const store = sessionStoreWith({ ...INITIAL_SESSION_STATE, ...stateOverrides })
  const queryClient = new QueryClient()
  render(
    <QueryClientProvider client={queryClient}>
      <SessionStoreContext.Provider value={store}>
        <TurnSelectionContext.Provider value={selection}>
          <CharacterView />
        </TurnSelectionContext.Provider>
      </SessionStoreContext.Provider>
    </QueryClientProvider>,
  )
}

const request = (text: string, turnId = 0): SessionRecord => ({
  kind: "request",
  turnId,
  text,
  images: [],
  time: { kind: "stamped", at: 0 },
})
const speech = (
  text: string,
  expression: "default" | "proud" | "flustered" = "default",
): SessionRecord => ({ kind: "speech", text, expression, time: { kind: "stamped", at: 0 } })

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

  it("(4) ツールが動いていても、表情は直近の speak のまま変わらない（自動の上書きは撤去済み）", () => {
    // 表情の源は `speak` の1つだけ（docs/requirements.md 4.3）。ツールが動いていても
    // 「作業中」へ勝手に切り替わらず、吹き出しにも作業中の一言は重ならない。
    renderCharacterView({
      speeches: ["さっき言ったセリフ"],
      speechExpression: "proud",
      runningTools: [
        {
          toolUseId: "toolu_1",
          name: "Read",
          input: {},
          nested: false,
          failureOutput: undefined,
        },
      ],
      character: {
        ...FIXTURE_CHARACTER,
        expressions: [
          { name: "default", label: "通常" },
          { name: "thinking", label: "作業中" },
          { name: "proud", label: "どや顔" },
        ],
        ...shownPortraits({
          default: "/character/default.png",
          thinking: "/character/thinking.png",
          proud: "/character/proud.png",
        }),
      },
    })

    expect(document.querySelector(".portrait")?.getAttribute("data-expression")).toBe("proud")
    expect(document.querySelector(".portrait-image")?.getAttribute("src")).toBe(
      "/character/proud.png",
    )
    expect(
      [...document.querySelectorAll(".balloon")].map((balloon) => balloon.textContent),
    ).toEqual(["さっき言ったセリフ"])
  })

  it("ターンが進行中でなく、直近の完了・失敗も無ければ data-motion は reading（呼吸だけ）", () => {
    renderCharacterView({
      character: FIXTURE_CHARACTER,
      turn: { kind: "idle" },
      lastToolFailureAt: undefined,
    })

    expect(document.querySelector(".portrait")?.getAttribute("data-motion")).toBe("reading")
  })

  it("ターンが進行中なら data-motion は waiting（領域の中を歩く）", () => {
    renderCharacterView({
      character: FIXTURE_CHARACTER,
      turn: { kind: "running", startedAt: 0 },
      lastToolFailureAt: undefined,
    })

    expect(document.querySelector(".portrait")?.getAttribute("data-motion")).toBe("waiting")
  })

  it("ターンが終わった直後は data-motion が success（完了の反応。偽の時計）", () => {
    const now = 1_700_000_000_000
    const clock = spyOn(Temporal.Now, "instant").mockReturnValue(
      Temporal.Instant.fromEpochMilliseconds(now),
    )
    try {
      renderCharacterView({
        character: FIXTURE_CHARACTER,
        turn: { kind: "finished", startedAt: now - 200, finishedAt: now - 100 },
        lastToolFailureAt: undefined,
      })

      expect(document.querySelector(".portrait")?.getAttribute("data-motion")).toBe("success")
    } finally {
      clock.mockRestore()
    }
  })

  it("ツールが失敗した直後は data-motion が failure（失敗でびくっ。偽の時計）", () => {
    const now = 1_700_000_000_000
    const clock = spyOn(Temporal.Now, "instant").mockReturnValue(
      Temporal.Instant.fromEpochMilliseconds(now),
    )
    try {
      renderCharacterView({
        character: FIXTURE_CHARACTER,
        turn: { kind: "running", startedAt: now - 200 },
        lastToolFailureAt: now - 100,
      })

      expect(document.querySelector(".portrait")?.getAttribute("data-motion")).toBe("failure")
    } finally {
      clock.mockRestore()
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

  it("過去のターンでは、そのターンの最後のセリフの表情になる", () => {
    renderCharacterView(
      {
        records: TWO_TURN_RECORDS,
        speeches: ["2つ目のセリフ"],
        speechExpression: "default",
        character: {
          ...FIXTURE_CHARACTER,
          expressions: [
            { name: "default", label: "通常" },
            { name: "flustered", label: "あわてた" },
          ],
          ...shownPortraits({
            default: "/character/default.png",
            flustered: "/character/flustered.png",
          }),
        },
      },
      { activeTurnId: 0, newestTurnId: 1, selectTurn: () => {} },
    )

    expect(document.querySelector(".portrait")?.getAttribute("data-expression")).toBe("flustered")
    expect(document.querySelector(".portrait-image")?.getAttribute("src")).toBe(
      "/character/flustered.png",
    )
  })
})
