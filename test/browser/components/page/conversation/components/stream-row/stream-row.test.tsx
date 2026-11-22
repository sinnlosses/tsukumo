import { cleanup, fireEvent, render } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"

import {
  StreamPostRow,
  StreamSpeechRow,
} from "../../../../../../../src/browser/components/page/conversation/components/stream-row/stream-row.tsx"
import { acquireOverlay } from "../../../../../../../src/browser/hooks/open-overlay.ts"

afterEach(cleanup)

const KNOWN = { kind: "known", dateTime: "2026-11-17T10:00", text: "10:00" } as const

function renderPost(): HTMLTimeElement {
  const { container } = render(
    <StreamPostRow time={KNOWN} speakerName="" className="">
      本文
    </StreamPostRow>,
  )
  const time = container.querySelector("time")
  if (time === null) {
    throw new Error("time が無い")
  }
  return time
}

function renderSpeech(selected: boolean, onRelease: () => void): HTMLElement {
  const { container } = render(
    <StreamSpeechRow
      text="架空のセリフ"
      time={KNOWN}
      liveness="plain"
      aim={<span data-aim="" />}
      speakerName="架空の名前"
      selected={selected}
      pop={false}
      onToggle={() => {}}
      onRelease={onRelease}
      className=""
    />,
  )
  const entry = container.querySelector<HTMLElement>('[data-speaker="character"]')
  if (entry === null) {
    throw new Error("セリフの行が無い")
  }
  return entry
}

describe("StreamSpeechRow の出方", () => {
  function renderArrival(onToggle?: () => void, arrival?: "swell"): HTMLElement {
    const { container } = render(
      <StreamSpeechRow
        text="架空のセリフ"
        time={KNOWN}
        liveness="plain"
        aim={undefined}
        speakerName=""
        selected={false}
        pop={false}
        {...(arrival === undefined ? {} : { arrival })}
        {...(onToggle === undefined ? {} : { onToggle })}
        className=""
      />,
    )
    const entry = container.querySelector<HTMLElement>('[data-speaker="character"]')
    if (entry === null) {
      throw new Error("セリフの行が無い")
    }
    return entry
  }

  it("arrival を渡すと、押せる行も押せない行も data-arrival がその値になる", () => {
    expect(renderArrival(() => {}, "swell").getAttribute("data-arrival")).toBe("swell")
    cleanup()
    expect(renderArrival(undefined, "swell").getAttribute("data-arrival")).toBe("swell")
  })

  it("渡さなければ data-arrival を付けない", () => {
    expect(renderArrival(() => {}).hasAttribute("data-arrival")).toBe(false)
  })
})

describe("StreamSpeechRow の押せる行", () => {
  it("話し手の名前と尾も描く", () => {
    const entry = renderSpeech(false, () => {})
    expect(entry.textContent).toContain("架空の名前")
    expect(entry.querySelector("[data-aim]")).not.toBeNull()
  })

  it("selected の行の Esc で onRelease を呼ぶ", () => {
    let released = 0
    fireEvent.keyDown(
      renderSpeech(true, () => {
        released += 1
      }),
      { key: "Escape" },
    )
    expect(released).toBe(1)
  })

  it("selected でない行・修飾キーつき・重なる面が開いているあいだは呼ばない", () => {
    let released = 0
    const onRelease = (): void => {
      released += 1
    }
    fireEvent.keyDown(renderSpeech(false, onRelease), { key: "Escape" })
    cleanup()
    const selected = renderSpeech(true, onRelease)
    fireEvent.keyDown(selected, { key: "Escape", metaKey: true })
    const release = acquireOverlay()
    fireEvent.keyDown(selected, { key: "Escape" })
    release()
    expect(released).toBe(0)
  })
})

describe("StreamPostRow の時刻", () => {
  it("時刻の分かる行には time を出す", () => {
    const time = renderPost()
    expect(time.dateTime).toBe("2026-11-17T10:00")
    expect(time.textContent).toBe("10:00")
  })
})
