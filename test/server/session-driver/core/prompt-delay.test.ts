import { describe, expect, it } from "vitest"

import {
  createPromptDelayWatch,
  PROMPT_DELAY_THRESHOLD_MS,
} from "../../../../src/server/session-driver/core/prompt-delay.ts"
import type { PromptDelayFootprint } from "../../../../src/shared/diagnostic/diagnostic-record.ts"

const START = 1_000_000

function watchWith(): {
  readonly reported: PromptDelayFootprint[]
  readonly watch: ReturnType<typeof createPromptDelayWatch>
} {
  const reported: PromptDelayFootprint[] = []
  return { reported, watch: createPromptDelayWatch((footprint) => reported.push(footprint)) }
}

describe("createPromptDelayWatch", () => {
  it("書き込みがしきい値を超えたとき、区間のミリ秒を1行書く", () => {
    const { reported, watch } = watchWith()

    watch.pushed(START)
    watch.written(START + PROMPT_DELAY_THRESHOLD_MS + 1)
    watch.received(START + PROMPT_DELAY_THRESHOLD_MS + 501)

    expect(reported).toEqual([
      {
        flow: "prompt-delay",
        at: START + PROMPT_DELAY_THRESHOLD_MS + 501,
        pushedAt: START,
        writeMs: PROMPT_DELAY_THRESHOLD_MS + 1,
        replyMs: 500,
      },
    ])
  })

  it("書き終えてから本体の最初のメッセージまでが超えたときも書く", () => {
    const { reported, watch } = watchWith()

    watch.pushed(START)
    watch.written(START + 10)
    watch.received(START + 10 + PROMPT_DELAY_THRESHOLD_MS + 1)

    expect(reported).toHaveLength(1)
    expect(reported[0]).toMatchObject({ writeMs: 10, replyMs: PROMPT_DELAY_THRESHOLD_MS + 1 })
  })

  it("どちらもしきい値ちょうど以内なら何も書かない", () => {
    const { reported, watch } = watchWith()

    watch.pushed(START)
    watch.written(START + PROMPT_DELAY_THRESHOLD_MS)
    watch.received(START + 2 * PROMPT_DELAY_THRESHOLD_MS)

    expect(reported).toEqual([])
  })

  it("書き終える前に届いたメッセージは数えず、最初の1通で1回だけ判定する", () => {
    const { reported, watch } = watchWith()

    watch.pushed(START)
    watch.received(START + 1)
    watch.written(START + 5000)
    watch.received(START + 5001)
    watch.received(START + 20_000)

    expect(reported).toHaveLength(1)
    expect(reported[0]).toMatchObject({ writeMs: 5000, replyMs: 1 })
  })

  it("書き終えたあと返答なしで次の依頼が来たら、前の依頼の時刻を持ち越さない", () => {
    const { reported, watch } = watchWith()

    watch.pushed(START)
    watch.written(START + 10)
    watch.pushed(START + 60_000)
    watch.written(START + 60_010)
    watch.received(START + 60_020)

    expect(reported).toEqual([])
  })

  it("中断で捨てたあとのメッセージは、前の依頼の時刻と突き合わせない", () => {
    const { reported, watch } = watchWith()

    watch.pushed(START)
    watch.written(START + 10)
    watch.discard()
    watch.received(START + 60_000)

    expect(reported).toEqual([])
  })
})
