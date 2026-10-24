import { describe, expect, it } from "vitest"

import { createChatArchiveOrder } from "../../../../src/server/chat/core/chat-archive-order.ts"

describe("createChatArchiveOrder", () => {
  it("手前に未完の追記が無ければ、その場で同期に走らせる", () => {
    const order = createChatArchiveOrder()
    const ran: string[] = []

    order.run(() => {
      ran.push("a")
      return undefined
    })

    expect(ran).toEqual(["a"])
  })

  it("手前が未完のあいだ後続は走らず、解けたら届いた順に走る", async () => {
    const order = createChatArchiveOrder()
    const ran: string[] = []
    const gate: { open: () => void } = { open: () => {} }
    const pending = new Promise<void>((resolve) => {
      gate.open = resolve
    })

    order.run(() => pending.then(() => void ran.push("first")))
    order.run(() => {
      ran.push("second")
      return undefined
    })
    order.run(() => {
      ran.push("third")
      return undefined
    })
    expect(ran).toEqual([])

    gate.open()
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(ran).toEqual(["first", "second", "third"])
  })

  it("手前が失敗しても後続は走り、全部済んだあとは同期に戻る", async () => {
    const order = createChatArchiveOrder()
    const ran: string[] = []

    order.run(() => Promise.reject(new Error("架空の失敗")))
    order.run(() => {
      ran.push("after")
      return undefined
    })
    await new Promise((resolve) => setTimeout(resolve, 0))
    order.run(() => {
      ran.push("sync")
      return undefined
    })

    expect(ran).toEqual(["after", "sync"])
  })
})
