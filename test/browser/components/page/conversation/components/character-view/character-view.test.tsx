import { QueryClientProvider } from "@tanstack/react-query"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"

import { CharacterView } from "../../../../../../../src/browser/components/page/conversation/components/character-view/character-view.tsx"
import {
  formatHash,
  parseHash,
  type ViewedTurn,
} from "../../../../../../../src/browser/stores/location-hash.ts"
import type { Expression } from "../../../../../../../src/shared/character-pack/expression.ts"
import {
  INITIAL_SESSION_STATE,
  type SessionRecord,
  type SessionState,
} from "../../../../../../../src/shared/session/session-state.ts"
import { characterInfo, shownPortraits } from "../../../../../../fixture/character.ts"
import { requestRecord, speechRecord } from "../../../../../../fixture/session-record.ts"
import { createTestQueryClient } from "../../../../../query-client.tsx"
import { putSession } from "../../../../../session-store.ts"

// フィクスチャはすべて手で書いた架空のキャラクター定義・セリフ（docs/coding-standards.md「会話内容の扱い」）。

/** `SessionState.speeches` の1件（表情は既定でよいテストのための簡略記法）。 */
function speech(
  text: string,
  expression: Expression = "default",
): SessionState["speeches"][number] {
  return { text, expression }
}

const FIXTURE_CHARACTER: NonNullable<SessionState["character"]> = characterInfo({
  ...shownPortraits({ default: "/character/default.png" }),
})

afterEach(() => {
  cleanup()
  window.location.hash = ""
})

// `<CharacterView>` は立ち絵に `<Portrait>`（`useQuery`）を使うので `QueryClientProvider` が要る。
// 過去のターンを見るテストは、そのターンの通し番号（`request` の `turnId`）を hash に乗せてから描く。
function renderCharacterView(
  stateOverrides: Partial<SessionState>,
  viewedTurn: ViewedTurn = "newest",
): void {
  window.location.hash = formatHash({ ...parseHash(""), turn: viewedTurn })
  putSession({ ...INITIAL_SESSION_STATE, ...stateOverrides })
  const queryClient = createTestQueryClient()
  render(
    <QueryClientProvider client={queryClient}>
      <CharacterView />
    </QueryClientProvider>,
  )
}

/** 通し番号 0 / 1 の2ターン分の記録（0 が過去、1 が今回）。 */
const TWO_TURN_RECORDS: readonly SessionRecord[] = [
  requestRecord({ text: "1つ目の依頼" }),
  speechRecord({ text: "1つ目のセリフA", expression: "proud" }),
  speechRecord({ text: "1つ目のセリフB", expression: "flustered" }),
  requestRecord({ turnId: 1, text: "2つ目の依頼" }),
  speechRecord({ text: "2つ目のセリフ", expression: "default" }),
]

describe("CharacterView", () => {
  it("(3) 立ち絵の URL が無い（character が undefined）ときは、吹き出しだけが出て落ちない", () => {
    expect(() =>
      renderCharacterView({ character: undefined, speeches: [speech("やあ、調子はどう？")] }),
    ).not.toThrow()

    expect(document.querySelector(".portrait")).toBeNull()
    expect(document.querySelector(".balloon-track")).not.toBeNull()
    expect(document.querySelector(".balloon-text")?.textContent).toBe("やあ、調子はどう？")
  })

  it("(1) 過去のターンを選ぶと、そのターンのセリフだけが吹き出しに出る", () => {
    renderCharacterView(
      {
        records: TWO_TURN_RECORDS,
        speeches: [speech("2つ目のセリフ")],
        character: FIXTURE_CHARACTER,
      },
      0,
    )

    expect(
      [...document.querySelectorAll(".balloon-text")].map((balloon) => balloon.textContent),
    ).toEqual(["1つ目のセリフB", "1つ目のセリフA"])
    // 最新（そのターンの最後）の1件だけが濃い（吹き出しの規則は変えない）。
    expect(document.querySelector(".balloon")?.getAttribute("data-latest")).toBe("true")
  })

  it("(2) 今回のターンを選ぶと、従来どおり今のセリフが出る", () => {
    renderCharacterView(
      {
        records: TWO_TURN_RECORDS,
        speeches: [speech("2つ目のセリフ")],
        character: FIXTURE_CHARACTER,
      },
      1,
    )

    expect(
      [...document.querySelectorAll(".balloon-text")].map((balloon) => balloon.textContent),
    ).toEqual(["2つ目のセリフ"])
  })

  it("(3) セリフが1件も無い過去のターンでも壊れず、そのターン向けの文言が出る", () => {
    const records: readonly SessionRecord[] = [
      requestRecord({ text: "1つ目の依頼" }),
      requestRecord({ turnId: 1, text: "2つ目の依頼" }),
      speechRecord({ text: "2つ目のセリフ" }),
    ]

    expect(() =>
      renderCharacterView(
        { records, speeches: [speech("2つ目のセリフ")], character: FIXTURE_CHARACTER },
        0,
      ),
    ).not.toThrow()

    expect(document.querySelectorAll(".balloon")).toHaveLength(1)
    expect(document.querySelector(".balloon-text")?.textContent).toBe(
      "（このターンでは発話がありませんでした）",
    )
    expect(document.querySelector(".portrait")?.getAttribute("data-expression")).toBe("default")
  })

  it("過去のターンでは、そのターンの最後のセリフの表情になる", () => {
    renderCharacterView(
      {
        records: TWO_TURN_RECORDS,
        speeches: [speech("2つ目のセリフ")],
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
      0,
    )

    expect(document.querySelector(".portrait")?.getAttribute("data-expression")).toBe("flustered")
    expect(document.querySelector(".portrait-image")?.getAttribute("src")).toBe(
      "/character/flustered.png",
    )
  })
})

describe("CharacterView（吹き出し・セリフのログを押すと遡る。docs/screen-design.md 13.7）", () => {
  const CHARACTER_WITH_PROUD: NonNullable<SessionState["character"]> = {
    ...FIXTURE_CHARACTER,
    expressions: [
      { name: "default", label: "通常" },
      { name: "proud", label: "得意げ" },
    ],
    ...shownPortraits({
      default: "/character/default.png",
      proud: "/character/proud.png",
    }),
  }

  /** 今のターンに、表情の違うセリフを2件並べた状態。 */
  function twoSpeechState(): Partial<SessionState> {
    return {
      records: [
        requestRecord({ text: "架空の依頼", turnId: 0 }),
        speechRecord({ text: "1つ目のセリフ", expression: "default" }),
        speechRecord({ text: "2つ目のセリフ", expression: "proud" }),
      ],
      speeches: [speech("1つ目のセリフ", "default"), speech("2つ目のセリフ", "proud")],
      speechExpression: "proud",
      speechCalledInTurn: true,
      character: CHARACTER_WITH_PROUD,
    }
  }

  it("吹き出しを押すと、そのセリフの表情へ立ち絵が遡り、もう一度押すと最新へ戻る", () => {
    renderCharacterView(twoSpeechState())
    expect(document.querySelector(".portrait")?.getAttribute("data-expression")).toBe("proud")

    const olderBalloon = document.querySelector("[data-latest='false']")
    expect(olderBalloon?.textContent).toBe("1つ目のセリフ")
    fireEvent.click(olderBalloon!)

    expect(document.querySelector(".portrait")?.getAttribute("data-expression")).toBe("default")
    expect(olderBalloon?.getAttribute("aria-pressed")).toBe("true")

    fireEvent.click(olderBalloon!)
    expect(document.querySelector(".portrait")?.getAttribute("data-expression")).toBe("proud")
  })

  it("セリフのログの行を押すと、ログの床の立ち絵がその表情になる", () => {
    renderCharacterView(twoSpeechState())
    fireEvent.click(screen.getByRole("button", { name: "ログ" }))

    const olderRow = [...document.querySelectorAll(".speech-log-speech .balloon")].find(
      (balloon) => balloon.textContent === "1つ目のセリフ",
    )
    expect(olderRow).toBeDefined()
    fireEvent.click(olderRow!)

    expect(
      document.querySelector(".speech-log-floor .portrait")?.getAttribute("data-expression"),
    ).toBe("default")
    // 状態は1つ（吹き出しとログで共有する。docs/display.md「吹き出し」）。
    expect(
      document.querySelector(".character-layout .portrait")?.getAttribute("data-expression"),
    ).toBe("default")
  })
})
