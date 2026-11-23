import { act, cleanup, fireEvent, screen, within } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"

import {
  INITIAL_SESSION_STATE,
  type SessionState,
} from "../../../../../../../src/shared/session/session-state.ts"
import {
  FIXTURE_CHARACTER,
  renderCharacterView,
  speech,
  WRITTEN_REACTIONS,
} from "../../../../../../fixture/character-view.tsx"
import { shownPortraits } from "../../../../../../fixture/character.ts"
import {
  reactionRecord,
  requestRecord,
  speechRecord,
} from "../../../../../../fixture/session-record.ts"
import { putState } from "../../../../../session-store.ts"

afterEach(() => {
  cleanup()
  window.location.hash = ""
})

describe("CharacterView（セリフのログの行を押すと遡る。docs/architecture/screen-design.md 13.7）", () => {
  const CHARACTER_WITH_PROUD: NonNullable<SessionState["character"]> = {
    ...FIXTURE_CHARACTER,
    expressions: [
      { name: "default", role: "通常", label: "通常" },
      { name: "proud", role: "得意気", label: "得意げ" },
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

  /** 開く口は狭い画面の吹き出し。 */
  function openLog(): HTMLElement {
    fireEvent.click(screen.getByTitle("セリフのログを開く"))
    return screen.getByRole("dialog", { name: "セリフのログ", hidden: true })
  }

  const portraitExpression = (): string | null | undefined =>
    document.querySelector(".portrait")?.getAttribute("data-expression")

  it("何も留めていなければ立ち絵は最新のセリフの表情に従う", () => {
    renderCharacterView(twoSpeechState())

    expect(portraitExpression()).toBe("proud")
  })

  it("何も留めていないあいだ、新しいセリフが届くたびに立ち絵は最新のセリフの表情へ替わる", () => {
    renderCharacterView(twoSpeechState())
    expect(portraitExpression()).toBe("proud")

    act(() => {
      putState({
        ...INITIAL_SESSION_STATE,
        ...twoSpeechState(),
        speeches: [
          speech("1つ目のセリフ", "default"),
          speech("2つ目のセリフ", "proud"),
          speech("3つ目のセリフ", "default"),
        ],
        speechExpression: "default",
      })
    })

    expect(portraitExpression()).toBe("default")
  })

  it("セリフのログの行を押すと、ログの床の立ち絵がその表情になる", () => {
    renderCharacterView(twoSpeechState())
    const log = openLog()
    const floorExpression = (): string | null | undefined =>
      log.querySelector(".speech-log-floor .portrait")?.getAttribute("data-expression")
    expect(floorExpression()).toBe("proud")

    fireEvent.click(within(log).getByRole("button", { name: "1つ目のセリフ", hidden: true }))

    expect(floorExpression()).toBe("default")
  })

  it("ログの行を押して留めると立ち絵がそのセリフの表情へ遡り、もう一度押すと最新へ戻る", () => {
    renderCharacterView(twoSpeechState())
    const log = openLog()
    const older = within(log).getByRole("button", { name: "1つ目のセリフ", hidden: true })

    fireEvent.click(older)
    expect(portraitExpression()).toBe("default")
    expect(older.getAttribute("aria-pressed")).toBe("true")

    fireEvent.click(older)
    expect(portraitExpression()).toBe("proud")
  })

  it("反応を出しているときも、ログの行を押して留めればそのセリフの表情が勝つ", () => {
    renderCharacterView({
      ...twoSpeechState(),
      turn: {
        kind: "finished",
        startedAt: 0,
        finishedAt: 1,
        ending: { kind: "failed", failure: { kind: "execution-error" } },
      },
      character: CHARACTER_WITH_PROUD,
      writtenReactions: WRITTEN_REACTIONS,
    })
    expect(portraitExpression()).toBe("sad")

    const log = openLog()
    fireEvent.click(within(log).getByRole("button", { name: "1つ目のセリフ", hidden: true }))

    expect(portraitExpression()).toBe("default")
  })

  it("今のターンの記録に反応が挟まっていても、ログの行は押した行のセリフを留める", () => {
    renderCharacterView({
      records: [
        requestRecord({ text: "架空の依頼", turnId: 0 }),
        reactionRecord({ reaction: "retrying", text: "架空の再試行反応", expression: "proud" }),
        speechRecord({ text: "1つ目のセリフ", expression: "default" }),
        speechRecord({ text: "2つ目のセリフ", expression: "proud" }),
      ],
      speeches: [speech("1つ目のセリフ", "default"), speech("2つ目のセリフ", "proud")],
      speechExpression: "proud",
      speechCalledInTurn: true,
      character: CHARACTER_WITH_PROUD,
    })
    const log = openLog()

    fireEvent.click(within(log).getByRole("button", { name: "1つ目のセリフ", hidden: true }))

    expect(
      within(log)
        .getByRole("button", { name: "1つ目のセリフ", hidden: true })
        .getAttribute("aria-pressed"),
    ).toBe("true")
    expect(portraitExpression()).toBe("default")
    expect(
      within(log)
        .getByRole("button", { name: "架空の再試行反応", hidden: true })
        .getAttribute("aria-pressed"),
    ).toBe("false")
  })
})
