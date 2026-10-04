import { afterEach, describe, expect, it } from "vitest"

import { reportBrowserError } from "../../../src/browser/domain/browser-error-report.ts"
import { rpcOutput, stubRpcFetch, type RpcFetchStub } from "../rpc-fetch-stub.ts"

/**
 * 送る内容だけを測る（`docs/architecture.md`「機能の中を分ける」）。画面は丸ごと描かない。
 */

let fetchStub: RpcFetchStub | undefined = undefined

afterEach(() => {
  fetchStub?.restore()
  fetchStub = undefined
})

function stubReportBrowserError(): RpcFetchStub {
  fetchStub = stubRpcFetch(() => rpcOutput(undefined))
  return fetchStub
}

describe("reportBrowserError", () => {
  it("既知の `error.name` はそのまま運び、`message` はどの欄にも入らない", async () => {
    const stub = stubReportBrowserError()
    const error = new TypeError("画面に出た文面")

    reportBrowserError("render-failure", error)
    await flush()

    const [call] = stub.calls()
    expect(call?.procedure).toBe("diagnostic/reportBrowserError")
    expect(call?.input).toMatchObject({ route: "render-failure", errorName: "TypeError" })
    expect(JSON.stringify(call?.input)).not.toContain("画面に出た文面")
  })

  it("知らない名前は `other` に写す", async () => {
    const stub = stubReportBrowserError()
    const error = { name: "架空のエラー" } as const
    Object.setPrototypeOf(error, Error.prototype)

    reportBrowserError("onerror", error)
    await flush()

    expect(stub.calls()[0]?.input).toMatchObject({ errorName: "other" })
  })

  it("`Error` でない値（文字列で reject されたなど）も `other` として送る", async () => {
    const stub = stubReportBrowserError()

    reportBrowserError("unhandledrejection", "文字列で reject された")
    await flush()

    expect(stub.calls()[0]?.input).toMatchObject({ errorName: "other", frames: [] })
  })

  it("送信が失敗しても例外を投げない", () => {
    fetchStub = stubRpcFetch(() => {
      throw new Error("架空の送信失敗")
    })

    expect(() => {
      reportBrowserError("onerror", new Error("架空のエラー"))
    }).not.toThrow()
  })
})

/** `fetch` の代役は非同期なので、呼ばれたことを確かめる前に1回イベントループを譲る。 */
function flush(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0))
}
