import { setImmediate } from "node:timers"

import { expect, test } from "vitest"

import { waitForQueuedMessages } from "../../../../src/server/session-driver/adapter/queued-message-wait.ts"

test("先に macrotask で予約した処理が、待ちの解決より前に走り終える", async () => {
  const ran: string[] = []
  setImmediate(() => ran.push("queued"))
  await waitForQueuedMessages()
  expect(ran).toEqual(["queued"])
})
