import { act, cleanup, fireEvent, screen, within } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { NO_SPEECH_ARRIVAL } from "../../../../../../../src/browser/components/page/conversation/domain/speech-arrival.ts"
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

const PRESS_NAME = /（押すと、いまの一言へ戻る）$/

const scrollIntoView = vi.fn<(options: ScrollIntoViewOptions) => void>()

beforeEach(() => {
  scrollIntoView.mockClear()
  Element.prototype.scrollIntoView = scrollIntoView
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
    callback(0)
    return 0
  })
  useSpeechArrival.setState({ arrival: NO_SPEECH_ARRIVAL })
})

afterEach(() => {
  cleanup()
  useComposerDraft.getState().typeDraft(EMPTY_DRAFT)
  vi.unstubAllGlobals()
  window.location.hash = ""
})

describe("CharacterView（立ち絵を押すと、いまの一言へ戻る）", () => {
  const stagePortrait = (): HTMLElement => screen.getByRole("button", { name: PRESS_NAME })
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

  it("留めたセリフがあれば解き、立ち絵が最新の表情へ戻る", () => {
    renderCharacterView(twoSpeechState())
    fireEvent.click(screen.getByTitle("セリフのログを開く"))
    const log = screen.getByRole("dialog", { name: "セリフのログ", hidden: true })
    fireEvent.click(within(log).getByRole("button", { name: "1つ目のセリフ", hidden: true }))
    expect(portraitExpression()).toBe("default")

    fireEvent.click(stagePortrait())

    expect(portraitExpression()).toBe("proud")
  })

  it("いまの一言が届いたものとして、動きと出方をもう一度掛ける", () => {
    renderCharacterView(twoSpeechState())
    expect(useSpeechArrival.getState().arrival.kind).toBe("none")

    fireEvent.click(stagePortrait())

    const arrival = useSpeechArrival.getState().arrival
    expect(arrival).toMatchObject({ kind: "arrived", index: 1, expression: "proud" })
  })

  it("Enter と Space でも押せる", () => {
    renderCharacterView(twoSpeechState())

    fireEvent.keyDown(stagePortrait(), { key: "Enter" })
    expect(useSpeechArrival.getState().arrival.kind).toBe("arrived")

    useSpeechArrival.setState({ arrival: NO_SPEECH_ARRIVAL })
    fireEvent.keyDown(stagePortrait(), { key: " " })
    expect(useSpeechArrival.getState().arrival.kind).toBe("arrived")

    useSpeechArrival.setState({ arrival: NO_SPEECH_ARRIVAL })
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
