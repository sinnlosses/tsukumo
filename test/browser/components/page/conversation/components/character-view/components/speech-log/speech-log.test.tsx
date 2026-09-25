import { afterEach, describe, expect, it } from "bun:test"

import { cleanup, fireEvent, render, screen } from "@testing-library/react"

import { SpeechLog } from "../../../../../../../../../src/browser/components/page/conversation/components/character-view/components/speech-log/speech-log.tsx"
import { SessionStoreContext } from "../../../../../../../../../src/browser/stores/session.tsx"
import {
  INITIAL_SESSION_STATE,
  type SessionRecord,
} from "../../../../../../../../../src/shared/session-state.ts"
import { characterInfo } from "../../../../../../../../fixture/character.ts"
import { requestRecord, speechRecord } from "../../../../../../../../fixture/session-record.ts"
import { sessionStoreWith } from "../../../../../../../session-store.ts"

// フィクスチャはすべて手で書いた架空の依頼・セリフ（docs/coding-standards.md「会話内容の扱い」）。

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
  const store = sessionStoreWith({
    ...INITIAL_SESSION_STATE,
    records,
    character: characterInfo({ userCall }),
  })
  render(
    <SessionStoreContext.Provider value={store}>
      <SpeechLog portrait={<img alt="架空の立ち絵" />} speakerName="架空の名前" />
    </SessionStoreContext.Provider>,
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

  it("Esc で閉じる（ブラウザが `<dialog>` を閉じて投げる close を受けて状態を戻す）", () => {
    renderSpeechLog([])
    openLog()

    // Esc の既定の動作は、ブラウザが `<dialog>` を閉じて close を投げること。happy-dom は
    // キーの既定の動作を持たないので、その結果の close を直接起こす（task-run.test.tsx と同じ）。
    fireEvent(dialog(), new Event("close"))
    expect(dialogIsOpen()).toBe(false)
    expect(screen.getByRole("button", { name: "ログ" }).getAttribute("aria-expanded")).toBe("false")
  })

  it("枠の外（backdrop）を押すと閉じ、枠の中を押しても閉じない", () => {
    renderSpeechLog([requestRecord({ text: "架空の依頼" }), speechRecord({ text: "架空のセリフ" })])
    openLog()

    fireEvent.click(screen.getByText("架空のセリフ"))
    fireEvent.click(document.querySelector(".speech-log-stage") ?? dialog())
    expect(dialogIsOpen()).toBe(true)

    // backdrop を押したときの target は `<dialog>` 自身になる。
    fireEvent.click(dialog())
    expect(dialogIsOpen()).toBe(false)
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

  it("最新のセリフだけが最新の吹き出しの見た目（data-latest）で、話し手の名前が添わる", () => {
    renderSpeechLog([
      requestRecord({ text: "架空の依頼" }),
      speechRecord({ text: "前のセリフ" }),
      speechRecord({ text: "最新のセリフ" }),
    ])
    openLog()

    const balloons = [...document.querySelectorAll(".speech-log-entries .balloon")]
    expect(balloons.map((balloon) => balloon.getAttribute("data-latest"))).toEqual([
      "false",
      "true",
    ])
    expect(balloons.at(-1)?.querySelector(".balloon-speaker")?.textContent).toBe("架空の名前")
    expect(balloons[0]?.querySelector(".balloon-speaker")).toBeNull()
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
    expect(requests[1]?.querySelector("time")?.getAttribute("dateTime")).toStartWith(
      "2026-09-23T14:32",
    )
    // 最新のセリフを含むターンの区切りだけが濃い。
    expect(requests.map((request) => request.getAttribute("data-current"))).toEqual([
      "false",
      "true",
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

  it("キャラビューから受け取った立ち絵を床に立たせる", () => {
    renderSpeechLog([])
    openLog()

    expect(document.querySelector(".speech-log-floor img")?.getAttribute("alt")).toBe(
      "架空の立ち絵",
    )
  })

  it("セリフが1件も無ければ、その旨の1行を出す", () => {
    renderSpeechLog([requestRecord({ text: "架空の依頼", turnId: 0 })])
    openLog()

    expect(screen.getByText("（まだ発話がありません）")).toBeDefined()
  })
})
