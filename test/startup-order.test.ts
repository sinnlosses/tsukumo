import { describe, expect, it } from "vitest"

import { openViewAfterRegisteringExit, readStartupPrerequisites } from "../src/startup-order.ts"

describe("openViewAfterRegisteringExit", () => {
  it("ビューを開く前に終了のハンドラを1度だけ登録する", async () => {
    const calls: string[] = []
    const gate = Promise.withResolvers<void>()

    const opening = openViewAfterRegisteringExit({
      registerExit: () => {
        calls.push("register")
      },
      openView: async () => {
        calls.push("open-start")
        await gate.promise
        calls.push("open-end")
        return "opened"
      },
    })

    expect(calls).toEqual(["register", "open-start"])
    gate.resolve()
    await expect(opening).resolves.toBe("opened")
    expect(calls).toEqual(["register", "open-start", "open-end"])
  })
})

describe("readStartupPrerequisites", () => {
  it("片方が終わる前にもう片方の読みを起こす", async () => {
    const calls: string[] = []
    const bundleGate = Promise.withResolvers<string>()

    const reading = readStartupPrerequisites({
      readBundle: () => {
        calls.push("bundle")
        return bundleGate.promise
      },
      checkPlugin: () => {
        calls.push("plugin")
        return Promise.resolve("plugin-result")
      },
    })

    expect(calls).toEqual(["bundle", "plugin"])
    bundleGate.resolve("bundle-result")
    await expect(reading).resolves.toEqual({
      built: "bundle-result",
      workflowPlugin: "plugin-result",
    })
  })
})
