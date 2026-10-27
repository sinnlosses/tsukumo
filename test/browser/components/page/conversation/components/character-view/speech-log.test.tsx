import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { useState, type ReactElement } from "react"
import { afterEach, describe, expect, it } from "vitest"

import { SpeechLog } from "../../../../../../../src/browser/components/page/conversation/components/character-view/speech-log.tsx"
import type { SessionRecord } from "../../../../../../../src/shared/session/session-record.ts"
import { INITIAL_SESSION_STATE } from "../../../../../../../src/shared/session/session-state.ts"
import { characterInfo } from "../../../../../../fixture/character.ts"
import { requestRecord, speechRecord } from "../../../../../../fixture/session-record.ts"
import { putSession } from "../../../../../session-store.ts"

afterEach(() => {
  cleanup()
})

function renderSpeechLog(records: readonly SessionRecord[]): void {
  renderSpeechLogWithCall(records, "きみ")
}

function renderSpeechLogWithCall(
  records: readonly SessionRecord[],
  userCall: string | undefined,
): void {
  putSession({
    ...INITIAL_SESSION_STATE,
    records,
    character: characterInfo({ userCall }),
  })
  render(<OpenableSpeechLog onToggleSpeech={() => {}} />)
}

/** 開閉はキャラビューが持つので、テストでは開閉の state だけを持つ親で包む。 */
function OpenableSpeechLog(props: {
  readonly onToggleSpeech: (turnId: number, index: number) => void
}): ReactElement {
  const [open, setOpen] = useState(false)
  return (
    <SpeechLog
      portrait={<img alt="架空の立ち絵" />}
      speakerName="架空の名前"
      pinnedSpeech={undefined}
      onToggleSpeech={props.onToggleSpeech}
      open={open}
      onOpen={() => setOpen(true)}
      onClose={() => setOpen(false)}
    />
  )
}

function dialog(): HTMLDialogElement {
  const found = document.querySelector("dialog")
  if (found === null) {
    throw new Error("<dialog> が無い")
  }
  return found
}

/** 開いているかどうかは `<dialog>` の `open` 属性で見る（happy-dom も showModal() で付ける）。 */
function dialogIsOpen(): boolean {
  return dialog().hasAttribute("open")
}

function openLog(): void {
  fireEvent.click(screen.getByRole("button", { name: "ログ" }))
}

/** この部屋の壁時計の時刻（`HH:MM`）に打たれた記録の時刻。 */
function stampedAt(isoLocal: string): { readonly kind: "stamped"; readonly at: number } {
  return {
    kind: "stamped",
    at: Temporal.PlainDateTime.from(isoLocal).toZonedDateTime(Temporal.Now.timeZoneId())
      .epochMilliseconds,
  }
}

/** 並びを上から順に、区切りは `request`、吹き出しは `speech` として読み出す。 */
function readEntries(): readonly (
  | { readonly kind: "request"; readonly text: string | null }
  | { readonly kind: "speech"; readonly text: string | null; readonly age: string | null }
)[] {
  return [...document.querySelectorAll(".speech-log-entries > li")].map((row) =>
    row.classList.contains("speech-log-request")
      ? { kind: "request", text: row.textContent }
      : {
          kind: "speech",
          text: row.querySelector(".balloon-text")?.textContent ?? null,
          age: row.getAttribute("data-age"),
        },
  )
}

describe("SpeechLog", () => {
  it("「ログ」を押すと開いて口が押された状態になり、「ログを閉じる」で閉じる", () => {
    renderSpeechLog([])
    const opener = screen.getByRole("button", { name: "ログ" })
    expect(dialogIsOpen()).toBe(false)
    expect(opener.getAttribute("aria-expanded")).toBe("false")

    openLog()
    expect(dialogIsOpen()).toBe(true)
    expect(opener.getAttribute("aria-expanded")).toBe("true")

    fireEvent.click(screen.getByRole("button", { name: "ログを閉じる" }))
    expect(dialogIsOpen()).toBe(false)
    expect(opener.getAttribute("aria-expanded")).toBe("false")
  })

  it("古い→新しいを上→下に、依頼の区切りとセリフを1本に並べ、最新が末尾（下端）に来る", () => {
    renderSpeechLog([
      speechRecord({ text: "依頼の前の挨拶" }),
      requestRecord({ text: "1つ目の依頼\n2行目", turnId: 0, time: stampedAt("2026-09-23T10:05") }),
      speechRecord({ text: "1つ目のセリフA" }),
      speechRecord({ text: "1つ目のセリフB" }),
      requestRecord({ text: "2つ目の依頼", turnId: 1 }),
      requestRecord({ text: "3つ目の依頼", turnId: 2, time: stampedAt("2026-09-23T11:40") }),
      speechRecord({ text: "3つ目のセリフA" }),
      speechRecord({ text: "3つ目のセリフB" }),
    ])
    openLog()

    // 依頼の前のセリフには区切りを置かない。セリフの無いターン（2つ目）は区切りごと並べない。
    // 古さの段は最新から数えて 1つ前・2つ前・3つ前から先。
    expect(readEntries()).toEqual([
      { kind: "speech", text: "依頼の前の挨拶", age: "oldest" },
      { kind: "request", text: "きみ「1つ目の依頼」10:05" },
      { kind: "speech", text: "1つ目のセリフA", age: "oldest" },
      { kind: "speech", text: "1つ目のセリフB", age: "older" },
      { kind: "request", text: "きみ「3つ目の依頼」11:40" },
      { kind: "speech", text: "3つ目のセリフA", age: "recent" },
      { kind: "speech", text: "3つ目のセリフB", age: "latest" },
    ])
  })

  it("依頼の区切りに依頼の時刻を出し、時刻の分からない（組み直した）依頼には出さない", () => {
    renderSpeechLog([
      requestRecord({ text: "組み直した依頼", turnId: 0, time: { kind: "restored" } }),
      speechRecord({ text: "前のセリフ" }),
      requestRecord({ text: "いまの依頼", turnId: 1, time: stampedAt("2026-09-23T14:32") }),
      speechRecord({ text: "いまのセリフ" }),
    ])
    openLog()

    const requests = [...document.querySelectorAll(".speech-log-request")]
    expect(requests.map((request) => request.textContent)).toEqual([
      "きみ「組み直した依頼」",
      "きみ「いまの依頼」14:32",
    ])
    expect(
      requests[1]?.querySelector("time")?.getAttribute("dateTime")?.startsWith("2026-09-23T14:32"),
    ).toBe(true)
    // 最新のセリフを含むターンの区切りだけが濃い。
    expect(requests.map((request) => request.getAttribute("data-current"))).toEqual([
      "false",
      "true",
    ])
  })

  it("セリフ1件ごとに HH:MM を出し、時刻の分からない（組み直した）セリフには出さない", () => {
    renderSpeechLog([
      requestRecord({ text: "架空の依頼", turnId: 0, time: stampedAt("2026-09-23T09:05") }),
      speechRecord({ text: "組み直したセリフ", time: { kind: "restored" } }),
      speechRecord({ text: "いまのセリフ", time: stampedAt("2026-09-23T09:07") }),
    ])
    openLog()

    const times = [...document.querySelectorAll(".speech-log-entries > li")]
      .filter((row) => row.hasAttribute("data-age"))
      .map((row) => row.querySelector("time")?.textContent ?? null)
    expect(times).toEqual([null, "09:07"])
  })

  it("日が変わるところのセリフの手前に日の区切りを入れ、先頭と同じ日の間には入れない", () => {
    renderSpeechLog([
      requestRecord({ text: "昨日の依頼", turnId: 0, time: stampedAt("2026-09-23T23:50") }),
      speechRecord({ text: "昨日のセリフA", time: stampedAt("2026-09-23T23:51") }),
      speechRecord({ text: "昨日のセリフB", time: stampedAt("2026-09-23T23:59") }),
      requestRecord({ text: "今日の依頼", turnId: 1, time: stampedAt("2026-09-24T00:10") }),
      speechRecord({ text: "今日のセリフ", time: stampedAt("2026-09-24T00:11") }),
    ])
    openLog()

    const rows = [...document.querySelectorAll(".speech-log-entries > li")].map((row) =>
      row.classList.contains("speech-log-day")
        ? `day:${row.textContent ?? ""}`
        : (row.querySelector(".balloon-text")?.textContent ?? "request"),
    )
    expect(rows).toEqual([
      "request",
      "昨日のセリフA",
      "昨日のセリフB",
      "request",
      "day:9月24日（木）",
      "今日のセリフ",
    ])
  })

  it("依頼の区切りの頭はパックの利用者の呼び名で、呼び名の無いパックでは「」だけになる", () => {
    const records = [
      requestRecord({ text: "架空の依頼", time: { kind: "restored" } }),
      speechRecord({ text: "架空のセリフ" }),
    ]
    renderSpeechLogWithCall(records, "あるじ")
    openLog()
    expect(document.querySelector(".speech-log-request")?.textContent).toBe("あるじ「架空の依頼」")

    cleanup()
    renderSpeechLogWithCall(records, undefined)
    openLog()
    expect(document.querySelector(".speech-log-request")?.textContent).toBe("「架空の依頼」")
  })

  it("セリフが1件も無ければ、その旨の1行を出す", () => {
    renderSpeechLog([requestRecord({ text: "架空の依頼", turnId: 0 })])
    openLog()

    expect(screen.getByText("（まだセリフがありません）")).toBeDefined()
  })

  it("何も留めていなければ最新の行に印が付き、行を押すと onToggleSpeech がその番号で呼ばれる", () => {
    const toggled: (readonly [number, number])[] = []
    putSession({
      ...INITIAL_SESSION_STATE,
      records: [
        requestRecord({ text: "架空の依頼", turnId: 0 }),
        speechRecord({ text: "1つ目のセリフ" }),
        speechRecord({ text: "2つ目のセリフ" }),
      ],
      character: characterInfo({}),
    })
    render(<OpenableSpeechLog onToggleSpeech={(turnId, index) => toggled.push([turnId, index])} />)
    openLog()

    const rows = [...document.querySelectorAll(".speech-log-speech .balloon")]
    expect(rows.map((row) => row.getAttribute("aria-pressed"))).toEqual(["false", "true"])

    fireEvent.click(rows[0] ?? dialog())
    expect(toggled).toEqual([[0, 0]])
  })
})
