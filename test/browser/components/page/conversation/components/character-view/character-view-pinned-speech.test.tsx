import { cleanup, fireEvent, screen, within } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"

import type { SessionState } from "../../../../../../../src/shared/session/session-state.ts"
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
import { typedElement } from "../../../../../../typed-element.ts"

afterEach(() => {
  cleanup()
  window.location.hash = ""
})

describe("CharacterView（吹き出しを押すと遡る。docs/architecture/screen-design.md 13.7）", () => {
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
    fireEvent.click(screen.getByRole("button", { name: /^ログ$/ }))
    const log = screen.getByRole("dialog", { name: "セリフのログ", hidden: true })
    const floorExpression = (): string | null | undefined =>
      log.querySelector(".speech-log-floor .portrait")?.getAttribute("data-expression")
    expect(floorExpression()).toBe("proud")

    fireEvent.click(within(log).getByRole("button", { name: "1つ目のセリフ", hidden: true }))

    expect(floorExpression()).toBe("default")
  })

  it("反応を出しているときも、セリフを押して留めればそのセリフの表情が勝つ", () => {
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
    expect(document.querySelector("[data-reaction='failed']")).not.toBeNull()
    expect(document.querySelector(".portrait")?.getAttribute("data-expression")).toBe("sad")

    const olderBalloon = [...document.querySelectorAll("[data-interactive='true']")].find(
      (balloon) => balloon.textContent === "1つ目のセリフ",
    )
    fireEvent.click(olderBalloon!)

    expect(document.querySelector(".portrait")?.getAttribute("data-expression")).toBe("default")
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

    const track = typedElement(
      document.querySelector(".balloon-track"),
      HTMLElement,
      "吹き出しの並び",
    )
    expect(
      within(track).getByRole("button", { name: "1つ目のセリフ" }).getAttribute("aria-pressed"),
    ).toBe("true")
    expect(document.querySelector(".portrait")?.getAttribute("data-expression")).toBe("default")

    fireEvent.click(within(track).getByRole("button", { name: /2つ目のセリフ$/ }))

    expect(
      within(log)
        .getByRole("button", { name: /2つ目のセリフ$/, hidden: true })
        .getAttribute("aria-pressed"),
    ).toBe("true")
    expect(
      within(log)
        .getByRole("button", { name: "架空の再試行反応", hidden: true })
        .getAttribute("aria-pressed"),
    ).toBe("false")
  })
})
