import { afterEach, describe, expect, it } from "bun:test"

import { cleanup, fireEvent, render, screen } from "@testing-library/react"

import { SpeechLog } from "../../../../src/browser/features/character-view/speech-log.tsx"
import { SessionStoreContext } from "../../../../src/browser/stores/session.tsx"
import { INITIAL_SESSION_STATE, type SessionRecord } from "../../../../src/shared/session-state.ts"
import { requestRecord, speechRecord } from "../../../fixture/session-record.ts"
import { sessionStoreWith } from "../../session-store.ts"

// フィクスチャはすべて手で書いた架空の依頼・セリフ（docs/coding-standards.md「会話内容の扱い」）。

afterEach(() => {
  cleanup()
})

function renderSpeechLog(records: readonly SessionRecord[]): void {
  const store = sessionStoreWith({ ...INITIAL_SESSION_STATE, records })
  render(
    <SessionStoreContext.Provider value={store}>
      <SpeechLog />
    </SessionStoreContext.Provider>,
  )
}

/** 開いているかどうかは `<dialog>` の `open` 属性で見る（happy-dom も showModal() で付ける）。 */
function dialogIsOpen(): boolean {
  return document.querySelector("dialog.speech-log")?.hasAttribute("open") === true
}

describe("SpeechLog", () => {
  it("「ログ」を押すと開き、「閉じる」で閉じる", () => {
    renderSpeechLog([])
    expect(dialogIsOpen()).toBe(false)

    fireEvent.click(screen.getByRole("button", { name: "ログ" }))
    expect(dialogIsOpen()).toBe(true)

    fireEvent.click(screen.getByRole("button", { name: "閉じる" }))
    expect(dialogIsOpen()).toBe(false)
  })

  it("新しいターンを上にして、ターンごとに依頼の1行目とセリフを言った順で並べる", () => {
    renderSpeechLog([
      requestRecord({ text: "1つ目の依頼\n2行目", turnId: 0 }),
      speechRecord({ text: "1つ目のセリフA" }),
      speechRecord({ text: "1つ目のセリフB" }),
      requestRecord({ text: "2つ目の依頼", turnId: 1 }),
      requestRecord({ text: "3つ目の依頼", turnId: 2 }),
      speechRecord({ text: "3つ目のセリフ" }),
    ])
    fireEvent.click(screen.getByRole("button", { name: "ログ" }))

    const turns = [...document.querySelectorAll(".speech-log-turn")].map((turn) => ({
      request: turn.querySelector(".speech-log-request")?.textContent,
      speeches: [...turn.querySelectorAll(".speech-log-speech")].map(
        (speech) => speech.textContent,
      ),
    }))
    // セリフの無いターン（2つ目）は並べない。
    expect(turns).toEqual([
      { request: "3つ目の依頼", speeches: ["3つ目のセリフ"] },
      { request: "1つ目の依頼", speeches: ["1つ目のセリフA", "1つ目のセリフB"] },
    ])
  })

  it("セリフが1件も無ければ、その旨の1行を出す", () => {
    renderSpeechLog([requestRecord({ text: "架空の依頼", turnId: 0 })])
    fireEvent.click(screen.getByRole("button", { name: "ログ" }))

    expect(screen.getByText("（まだ発話がありません）")).toBeDefined()
  })
})
