import { act } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import { reportBrowserError } from "../../../../src/browser/components/app/browser-error-report.ts"
import { useSession } from "../../../../src/browser/stores/session.ts"
import { INITIAL_SESSION_STATE } from "../../../../src/shared/session/session-state.ts"
import { putSession, type SentCommand } from "../../session-store.ts"

/**
 * 送る内容だけを測る（`docs/architecture.md`「機能の中を分ける」）。画面は丸ごと描かない。
 */

function putRecordingSession(): SentCommand[] {
  const sent: SentCommand[] = []
  putSession(INITIAL_SESSION_STATE, (command) => {
    sent.push(command)
  })
  return sent
}

describe("reportBrowserError", () => {
  it("既知の `error.name` はそのまま運び、`message` はどの欄にも入らない", async () => {
    const sent = putRecordingSession()
    const error = new TypeError("画面に出た文面")

    reportBrowserError("render-failure", error)
    await flush()

    const [command] = sent
    expect(command?.procedure).toBe("diagnostic.reportBrowserError")
    expect(command).toMatchObject({ route: "render-failure", errorName: "TypeError" })
    expect(JSON.stringify(command)).not.toContain("画面に出た文面")
  })

  it("知らない名前は `other` に写す", async () => {
    const sent = putRecordingSession()
    const error = { name: "架空のエラー" } as const
    Object.setPrototypeOf(error, Error.prototype)

    reportBrowserError("onerror", error)
    await flush()

    expect(sent[0]).toMatchObject({ errorName: "other" })
  })

  it("`Error` でない値（文字列で reject されたなど）も `other` として送る", async () => {
    const sent = putRecordingSession()

    reportBrowserError("unhandledrejection", "文字列で reject された")
    await flush()

    expect(sent[0]).toMatchObject({ errorName: "other", frames: [] })
  })

  it("送信が失敗しても例外を投げない", async () => {
    putSession(INITIAL_SESSION_STATE, () => Promise.reject(new Error("架空の送信失敗")))

    expect(() => {
      reportBrowserError("onerror", new Error("架空のエラー"))
    }).not.toThrow()
    await flush()
  })

  it("接続が無いときは送らずに捨て、例外を投げない", async () => {
    putSession(INITIAL_SESSION_STATE)
    act(() => {
      useSession.getState().attachSocket(undefined)
    })

    expect(() => {
      reportBrowserError("onerror", new Error("架空のエラー"))
    }).not.toThrow()
    await flush()
  })
})

/** コマンドの送り先は非同期なので、送られたことを確かめる前に1回イベントループを譲る。 */
function flush(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0))
}
