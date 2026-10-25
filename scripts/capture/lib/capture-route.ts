// 撮影のページに掛ける、手続きの応答とセッションの購読の差し替え・保留。

import type { Page } from "playwright-core"

import { isStubbedCall, type RpcStub, rpcPathOf } from "./capture-stub.ts"

/** 数え上げをブラウザ側に置くと再マウントで数えが狂うので、Node 側の `calls` で持つ。 */
export async function stubRpc(page: Page, stub: RpcStub): Promise<void> {
  let calls = 0
  await page.route(`**/rpc/${rpcPathOf(stub.procedure)}**`, async (route) => {
    calls += 1
    if (!isStubbedCall(stub.range, calls)) {
      await route.continue()
      return
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ json: stub.body }),
    })
  })
}

/**
 * 手続きの応答は返さない。`stream` のときは、ページからサーバへは通し、サーバからページへのフレームを捨てる。
 * 保留はページを閉じると破棄される。
 */
export async function applyHolds(
  page: Page,
  procedures: readonly string[],
  stream: boolean,
): Promise<void> {
  for (const procedure of procedures) {
    await page.route(`**/rpc/${rpcPathOf(procedure)}**`, () => undefined)
  }
  if (stream) {
    await page.routeWebSocket(/\/ws/, (socket) => {
      const server = socket.connectToServer()
      server.onMessage(() => undefined)
      socket.onMessage((message) => {
        server.send(message)
      })
    })
  }
}
