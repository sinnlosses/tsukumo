import { cleanup, fireEvent, render } from "@testing-library/react"
import type { ReactElement } from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { saveRevealSpeed } from "../../../../src/browser/domain/reveal-speed.ts"
import {
  publishBrushTip,
  subscribeBrushTip,
} from "../../../../src/browser/domain/reveal/brush-tip.ts"
import { useReportReveal } from "../../../../src/browser/domain/reveal/use-report-reveal.ts"

const REVEAL_SPEED_STORAGE_KEY = "tsukumo-reveal-speed:v1"

// ポンの見え方（animation）は実ブラウザでしか確かめられないので、ここで守るのは隠す・順に出す・打ち切るの配線だけ。

/** 演出を掛ける相手のやり取り（配る筆先に添う番号。`BrushTip`）。 */
const TURN_ID = 4

const POP_CLASS_NAME = "probe-pop"

/** 標準の速さで、塊を1つ出してから次を出すまでの間隔（ms）。 */
const STANDARD_INTERVAL_MS = 240

/** 節の欄1つの長さ。短いレポートの目安（`SHORT_REPORT_WEIGHT` は 200）を3つで超える。 */
const SECTION_TEXT = "架空の本文。".repeat(15)

function Probe(props: {
  readonly reveal: boolean
  readonly sections: readonly string[]
}): ReactElement {
  const rootRef = useReportReveal(props.reveal, TURN_ID, () => {}, POP_CLASS_NAME)

  return (
    <div data-testid="root" ref={rootRef}>
      <div data-report-region="head">
        <p className="conclusion">架空の結論</p>
      </div>
      {props.sections.map((text, index) => (
        <div
          key={text + String(index)}
          data-report-region="section"
          data-report-section={String(index)}
        >
          <h4>{`架空の節 ${String(index)}`}</h4>
          <p>{text}</p>
        </div>
      ))}
      <div data-report-region="retrospective">
        <p>架空の振り返り</p>
      </div>
    </div>
  )
}

function renderProbe(reveal: boolean, count = 3): void {
  render(<Probe reveal={reveal} sections={Array(count).fill(SECTION_TEXT)} />)
}

function root(): HTMLElement {
  const node = document.querySelector("[data-testid='root']")
  if (!(node instanceof HTMLElement)) {
    throw new Error("根が見つからない")
  }
  return node
}

function child(selector: string): HTMLElement {
  const node = root().querySelector(selector)
  if (!(node instanceof HTMLElement)) {
    throw new Error(`${selector} が見つからない`)
  }
  return node
}

/** 根の直下の子ごとの見え方（隠れている・ポンで出た・素のまま）。頭の欄から順に並ぶ。 */
function states(): readonly string[] {
  return [...root().children].map((node) => {
    if (!(node instanceof HTMLElement)) {
      return "?"
    }
    if (node.style.opacity === "0" && node.getAttribute("data-reveal") === "pending") {
      return "隠れている"
    }
    return node.classList.contains(POP_CLASS_NAME) ? "出た" : "素"
  })
}

/** いまの筆先の区別と、筆先を出したやり取り。受け取りは呼んだその場で1回届くので、すぐ外す。 */
function brushTipText(): string {
  let text = "筆先なし"
  const stop = subscribeBrushTip((tip) => {
    if (tip !== undefined) {
      text = `${tip.phase}:${String(tip.turnId)}`
    }
  })
  stop()
  return text
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] })
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  publishBrushTip(undefined)
  localStorage.removeItem(REVEAL_SPEED_STORAGE_KEY)
})

describe("useReportReveal（塊を順にポンで出す配線）", () => {
  it("演出の相手でなければ、何も隠さない", () => {
    renderProbe(false)

    expect(root().hasAttribute("data-revealing")).toBe(false)
    expect(states()).toEqual(["素", "素", "素", "素", "素"])
  })

  it("描画したその場で、頭の欄を除いて隠し、先頭の節だけをポンで出す", () => {
    renderProbe(true)

    expect(root().getAttribute("data-revealing")).toBe("yes")
    expect(states()).toEqual(["素", "出た", "隠れている", "隠れている", "隠れている"])
  })

  it("間隔ごとに次の節を出し、節の後ろの欄は直前の節と一緒に出て、出し切ったら演出を終える", () => {
    renderProbe(true)

    vi.advanceTimersByTime(STANDARD_INTERVAL_MS)
    expect(states()).toEqual(["素", "出た", "出た", "隠れている", "隠れている"])

    vi.advanceTimersByTime(STANDARD_INTERVAL_MS)
    expect(states()).toEqual(["素", "出た", "出た", "出た", "出た"])
    expect(root().hasAttribute("data-revealing")).toBe(false)
  })

  it("「速い」なら間隔は標準の半分", () => {
    saveRevealSpeed("fast")
    renderProbe(true)

    vi.advanceTimersByTime(STANDARD_INTERVAL_MS / 2)
    expect(states()).toEqual(["素", "出た", "出た", "隠れている", "隠れている"])
  })

  it("節が多くても全体は3秒に収める", () => {
    renderProbe(true, 30)

    vi.advanceTimersByTime(3000)
    expect(root().hasAttribute("data-revealing")).toBe(false)
  })

  it("節が短いレポートは演出せず、何も隠さない", () => {
    render(<Probe reveal={true} sections={["架空の短い本文。"]} />)

    expect(root().hasAttribute("data-revealing")).toBe(false)
    expect(states()).toEqual(["素", "素", "素"])
  })

  it("キー入力で残りを即座に出し、届いていない印も外れる", () => {
    renderProbe(true)

    fireEvent.keyDown(window)

    expect(root().hasAttribute("data-revealing")).toBe(false)
    expect(states()).toEqual(["素", "出た", "出た", "出た", "出た"])
    expect(child("[data-report-section='2']").hasAttribute("data-reveal")).toBe(false)
  })

  it("クリック（ポインタを下ろした時点）で残りを即座に出す", () => {
    renderProbe(true)

    fireEvent(window, new Event("pointerdown"))

    expect(root().hasAttribute("data-revealing")).toBe(false)
  })

  it("スクロール（ホイール・指）では打ち切らない", () => {
    renderProbe(true)

    fireEvent(window, new Event("wheel"))
    fireEvent(window, new Event("touchmove"))

    expect(root().getAttribute("data-revealing")).toBe("yes")
  })

  it("部品が外れたら、隠したままにしない", () => {
    const { unmount } = render(<Probe reveal={true} sections={Array(3).fill(SECTION_TEXT)} />)
    const hidden = child("[data-report-section='2']")

    unmount()

    expect(hidden.style.opacity).toBe("")
  })
})

describe("useReportReveal（筆先）", () => {
  function renderInOrigin(): void {
    render(
      <div data-brush-origin="">
        <Probe reveal={true} sections={Array(3).fill(SECTION_TEXT)} />
      </div>,
    )
  }

  it("出しているあいだは次の節で書いている筆先を配り、出し切ったら休ませる", () => {
    renderInOrigin()
    expect(brushTipText()).toBe(`drafting:${String(TURN_ID)}`)

    vi.advanceTimersByTime(STANDARD_INTERVAL_MS * 2)
    expect(brushTipText()).toBe(`resting:${String(TURN_ID)}`)
  })

  it("原点の印が無ければ筆先を配らない", () => {
    renderProbe(true)

    expect(brushTipText()).toBe("筆先なし")
  })
})

describe("useReportReveal（書き上げる演出の速さが「切る」のとき）", () => {
  it("演出の相手でも、マウント時点で「切る」が保存されていれば何も隠さず、筆先も配らない", () => {
    saveRevealSpeed("off")

    render(
      <div data-brush-origin="">
        <Probe reveal={true} sections={Array(3).fill(SECTION_TEXT)} />
      </div>,
    )

    expect(root().hasAttribute("data-revealing")).toBe(false)
    expect(states()).toEqual(["素", "素", "素", "素", "素"])
    expect(brushTipText()).toBe("筆先なし")
  })
})
