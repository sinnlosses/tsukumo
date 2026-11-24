import { act, cleanup, fireEvent, screen, within } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import {
  NO_SHOWN_MANPUS,
  NO_SPEECH_ARRIVAL,
} from "../../../../../../../src/browser/components/page/conversation/domain/speech-arrival.ts"
import {
  EMPTY_DRAFT,
  useComposerDraft,
} from "../../../../../../../src/browser/components/page/conversation/stores/composer-draft.ts"
import { useSpeechArrival } from "../../../../../../../src/browser/components/page/conversation/stores/speech-arrival.ts"
import type { SessionState } from "../../../../../../../src/shared/session/session-state.ts"
import {
  FIXTURE_CHARACTER,
  renderCharacterView,
  speech,
} from "../../../../../../fixture/character-view.tsx"
import { shownPortraits } from "../../../../../../fixture/character.ts"
import { requestRecord, speechRecord } from "../../../../../../fixture/session-record.ts"

const CHARACTER: NonNullable<SessionState["character"]> = {
  ...FIXTURE_CHARACTER,
  expressions: [
    { name: "default", role: "通常", label: "通常" },
    { name: "proud", role: "得意気", label: "得意げ" },
  ],
  ...shownPortraits({ default: "/character/default.png", proud: "/character/proud.png" }),
}

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
    character: CHARACTER,
  }
}

const scrollIntoView = vi.fn<(options: ScrollIntoViewOptions) => void>()

beforeEach(() => {
  scrollIntoView.mockClear()
  Element.prototype.scrollIntoView = scrollIntoView
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
    callback(0)
    return 0
  })
  useSpeechArrival.setState({ arrival: NO_SPEECH_ARRIVAL, shown: NO_SHOWN_MANPUS })
})

afterEach(() => {
  cleanup()
  useComposerDraft.getState().typeDraft(EMPTY_DRAFT)
  vi.unstubAllGlobals()
  window.location.hash = ""
})

describe("CharacterView（立ち絵を押すと、いまの一言へ戻る）", () => {
  const stagePortrait = (): HTMLElement => screen.getByRole("button", { name: /（押すと、.+）$/ })
  const pinFirstSpeech = (): void => {
    fireEvent.click(screen.getByTitle("セリフのログを開く"))
    const log = screen.getByRole("dialog", { name: "セリフのログ", hidden: true })
    fireEvent.click(within(log).getByRole("button", { name: "1つ目のセリフ", hidden: true }))
  }
  const portraitExpression = (): string | null | undefined =>
    document
      .querySelector("[data-character-stage] [data-expression]")
      ?.getAttribute("data-expression")

  it("立ち絵は押せる部品で、読み上げの名前に押した先を言う", () => {
    renderCharacterView(twoSpeechState())

    expect(stagePortrait().getAttribute("tabindex")).toBe("0")
    expect(stagePortrait().getAttribute("aria-label")).toBe(
      `${CHARACTER.name}（押すと、いまの一言へ戻る）`,
    )
  })

  it("留めたセリフがあれば留めたまま、そのセリフの表情で動きと出方をもう一度掛ける", () => {
    renderCharacterView(twoSpeechState())
    pinFirstSpeech()
    expect(portraitExpression()).toBe("default")

    fireEvent.click(stagePortrait())

    expect(portraitExpression()).toBe("default")
    expect(useSpeechArrival.getState().arrival).toMatchObject({
      kind: "arrived",
      index: 0,
      expression: "default",
    })
  })

  it("留めたセリフのあいだに出したエフェクトがあれば、押すとそれを出し直す", () => {
    renderCharacterView(twoSpeechState())
    act(() => {
      useSpeechArrival.getState().recordShown("stars", { turnId: 0, index: 0 })
      useSpeechArrival.getState().recordShown("shock")
    })
    pinFirstSpeech()

    fireEvent.click(stagePortrait())

    expect(document.body.querySelector("[data-manpu]")?.getAttribute("data-manpu")).toBe("stars")
  })

  it("留めているあいだは、読み上げの名前が押した先を言い換える", () => {
    renderCharacterView(twoSpeechState())
    pinFirstSpeech()

    expect(
      screen.getByRole("button", { name: /（押すと、選んだ一言の出方をもう一度）$/ }),
    ).toBeDefined()
  })

  it("いまの一言が届いたものとして、動きと出方をもう一度掛ける", () => {
    renderCharacterView(twoSpeechState())
    expect(useSpeechArrival.getState().arrival.kind).toBe("none")

    fireEvent.click(stagePortrait())

    const arrival = useSpeechArrival.getState().arrival
    expect(arrival).toMatchObject({ kind: "arrived", index: 1, expression: "proud" })
  })

  it("いまの一言のあいだに出したエフェクトがあれば、表情のエフェクトでなくそれを出し直す", () => {
    renderCharacterView(twoSpeechState())
    act(() => {
      useSpeechArrival.getState().recordShown("stars")
    })

    fireEvent.click(stagePortrait())

    expect(document.body.querySelector("[data-manpu]")?.getAttribute("data-manpu")).toBe("stars")
  })

  it("控えが前の声のものなら使わず、表情のエフェクトを出す", () => {
    renderCharacterView(twoSpeechState())
    act(() => {
      useSpeechArrival.getState().recordShown("stars", { turnId: 0, index: 0 })
    })

    fireEvent.click(stagePortrait())

    expect(document.body.querySelector("[data-manpu]")?.getAttribute("data-manpu")).toBe("sparkle")
  })

  it("Enter と Space でも押せる", () => {
    renderCharacterView(twoSpeechState())

    fireEvent.keyDown(stagePortrait(), { key: "Enter" })
    expect(useSpeechArrival.getState().arrival.kind).toBe("arrived")

    useSpeechArrival.setState({ arrival: NO_SPEECH_ARRIVAL, shown: NO_SHOWN_MANPUS })
    fireEvent.keyDown(stagePortrait(), { key: " " })
    expect(useSpeechArrival.getState().arrival.kind).toBe("arrived")

    useSpeechArrival.setState({ arrival: NO_SPEECH_ARRIVAL, shown: NO_SHOWN_MANPUS })
    fireEvent.keyDown(stagePortrait(), { key: "a" })
    expect(useSpeechArrival.getState().arrival.kind).toBe("none")
  })

  it("入力欄に字があるあいだだけ聞く姿勢を取り、空に戻すと外れる", () => {
    renderCharacterView(twoSpeechState())
    const listening = (): boolean => stagePortrait().hasAttribute("data-listening")
    expect(listening()).toBe(false)

    act(() => {
      useComposerDraft.getState().typeDraft({ text: "あ", caret: 1 })
    })
    expect(listening()).toBe(true)

    act(() => {
      useComposerDraft.getState().typeDraft(EMPTY_DRAFT)
    })
    expect(listening()).toBe(false)
  })

  it("従っているセリフの行が流れに無いとき（流れを出していない）は、流れを送らない", () => {
    renderCharacterView(twoSpeechState())

    fireEvent.click(stagePortrait())

    expect(scrollIntoView).not.toHaveBeenCalled()
  })

  it("従っているセリフの行が流れの中にあれば、そこまで送る", () => {
    renderCharacterView(twoSpeechState())
    const row = document.createElement("div")
    row.setAttribute("data-followed", "")
    document.body.append(row)

    fireEvent.click(stagePortrait())

    expect(scrollIntoView).toHaveBeenCalledWith({ block: "nearest", behavior: "smooth" })
    row.remove()
  })

  it("従っているセリフが定位置の声のときは、流れを送らない", () => {
    renderCharacterView(twoSpeechState())
    const slot = document.createElement("div")
    slot.setAttribute("data-voice-slot", "")
    const row = document.createElement("div")
    row.setAttribute("data-followed", "")
    slot.append(row)
    document.body.append(slot)

    fireEvent.click(stagePortrait())

    expect(scrollIntoView).not.toHaveBeenCalled()
    slot.remove()
  })
})
