import { describe, expect, it } from "vitest"

import { createPromptStream } from "../../../../src/server/session-driver/adapter/sdk-prompt-stream.ts"
import { createPromptDelayWatch } from "../../../../src/server/session-driver/core/prompt-delay.ts"

function newPromptStream() {
  return createPromptStream(
    createPromptDelayWatch(() => undefined),
    () => 0,
  )
}

const UUID = "00000000-0000-4000-8000-000000000001"

describe("createPromptStream", () => {
  it("文面だけの依頼は、利用者の入力の印と文字列の content と、渡した uuid を持つメッセージで流れる", async () => {
    const prompts = newPromptStream()
    prompts.push({ text: "作り物の依頼", images: [], uuid: UUID })

    const first = await prompts.stream()[Symbol.asyncIterator]().next()

    expect(first.value).toMatchObject({
      type: "user",
      origin: { kind: "human" },
      message: { role: "user", content: "作り物の依頼" },
      uuid: UUID,
    })
  })

  it("画像を添えた依頼も利用者の入力の印を持ち、content は画像のブロックが先・文面が後ろになる", async () => {
    const prompts = newPromptStream()
    const image = {
      type: "image",
      source: { type: "base64", media_type: "image/png", data: "AAAA" },
    } as const
    prompts.push({ text: "作り物の依頼", images: [image], uuid: UUID })

    const first = await prompts.stream()[Symbol.asyncIterator]().next()

    expect(first.value).toMatchObject({
      origin: { kind: "human" },
      message: { content: [image, { type: "text", text: "作り物の依頼" }] },
    })
  })

  it("end のあとは、溜まった依頼を流し終えて stream が終わる", async () => {
    const prompts = newPromptStream()
    prompts.push({ text: "作り物の依頼", images: [], uuid: UUID })
    prompts.end()
    const iterator = prompts.stream()[Symbol.asyncIterator]()

    const first = await iterator.next()
    const second = await iterator.next()

    expect(first.done).toBe(false)
    expect(second.done).toBe(true)
  })
})
