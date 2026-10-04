// 送れないときは、送り口が成功を装わず reject する。
// 閉じる途中・繋ぎ中の接続（`OPEN` でない）へ送った手続きを、呼び出し側が成功と取り違えない。

import { afterEach, describe, expect, it, vi } from "vitest"

import { connectSessionSocket } from "../../../src/browser/lib/socket.ts"

class FakeWebSocket {
  static readonly OPEN = 1
  readonly readyState = 0
  addEventListener(): void {}
  removeEventListener(): void {}
  send(): void {}
  close(): void {}
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe("connectSessionSocket の commandLink", () => {
  it("接続が OPEN でない間は、手続きを送らず reject する", async () => {
    vi.stubGlobal("WebSocket", FakeWebSocket)
    const socket = connectSessionSocket("/ws", { onFrame: () => {}, onStatusChange: () => {} })

    await expect(
      socket.commandLink.call(["characterPack", "create"], {}, { context: {} }),
    ).rejects.toThrow()

    socket.close()
  })
})
