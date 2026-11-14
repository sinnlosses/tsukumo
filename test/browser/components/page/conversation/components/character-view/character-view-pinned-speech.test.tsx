import { cleanup, fireEvent, screen, within } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"

import type { SessionState } from "../../../../../../../src/shared/session/session-state.ts"
import {
  FIXTURE_CHARACTER,
  renderCharacterView,
  speech,
} from "../../../../../../fixture/character-view.tsx"
import { shownPortraits } from "../../../../../../fixture/character.ts"
import {
  reactionRecord,
  requestRecord,
  speechRecord,
} from "../../../../../../fixture/session-record.ts"

afterEach(() => {
  cleanup()
  window.location.hash = ""
})

describe("CharacterView（セリフを押すと遡る。docs/architecture/screen-design.md 13.7）", () => {
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

  it("セリフのログの行を押すと、舞台の立ち絵がその表情になる", () => {
    renderCharacterView(twoSpeechState())
    fireEvent.click(screen.getByRole("button", { name: /^ログ$/ }))
    const log = screen.getByRole("dialog", { name: "セリフのログ", hidden: true })
    const stageExpression = (): string | null | undefined =>
      document
        .querySelector('[data-slot="portrait"] [data-expression]')
        ?.getAttribute("data-expression")
    expect(stageExpression()).toBe("proud")

    fireEvent.click(within(log).getByRole("button", { name: "1つ目のセリフ", hidden: true }))

    expect(stageExpression()).toBe("default")
  })

  it("今のターンの記録に反応が挟まっていても、ログの行と吹き出しは同じセリフを留める", () => {
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
    fireEvent.click(screen.getByRole("button", { name: /^ログ$/ }))
    const log = screen.getByRole("dialog", { name: "セリフのログ", hidden: true })

    fireEvent.click(within(log).getByRole("button", { name: "1つ目のセリフ", hidden: true }))

    expect(
      within(log)
        .getByRole("button", { name: "1つ目のセリフ", hidden: true })
        .getAttribute("aria-pressed"),
    ).toBe("true")
    expect(
      within(log)
        .getByRole("button", { name: "架空の再試行反応", hidden: true })
        .getAttribute("aria-pressed"),
    ).toBe("false")
    expect(document.querySelector(".portrait")?.getAttribute("data-expression")).toBe("default")
  })
})
