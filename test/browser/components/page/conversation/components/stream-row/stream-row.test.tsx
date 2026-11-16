import { cleanup, render } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"

import { StreamPostRow } from "../../../../../../../src/browser/components/page/conversation/components/stream-row/stream-row.tsx"

afterEach(cleanup)

const KNOWN = { kind: "known", dateTime: "2026-11-17T10:00", text: "10:00" } as const

function renderPost(timeShown: boolean): HTMLTimeElement {
  const { container } = render(
    <StreamPostRow time={KNOWN} timeShown={timeShown} speakerName="" className="">
      本文
    </StreamPostRow>,
  )
  const time = container.querySelector("time")
  if (time === null) {
    throw new Error("time が無い")
  }
  return time
}

describe("StreamPostRow の時刻", () => {
  it("見せない行にも、見えない字の time を残す", () => {
    const time = renderPost(false)
    expect(time.dateTime).toBe("2026-11-17T10:00")
    expect(time.textContent).toBe("10:00")
    expect(time.hasAttribute("data-quiet")).toBe(true)
  })

  it("見せる行の time には見えない印を付けない", () => {
    expect(renderPost(true).hasAttribute("data-quiet")).toBe(false)
  })
})
