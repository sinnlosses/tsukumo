import { describe, expect, it } from "vitest"

import { recordedMessages } from "../../../src/server/adapter/sdk-throwaway-query.ts"
import type { ThrowawayQueryFootprint } from "../../../src/server/core/throwaway-query.ts"

/** 呼ぶたびに `step` ずつ進む時計。 */
function steppingClock(step: number): () => number {
  let now = 1_000
  return () => {
    now += step
    return now
  }
}

function result(subtype: string, models: Readonly<Record<string, readonly number[]>>): unknown {
  return {
    type: "result",
    subtype,
    modelUsage: Object.fromEntries(
      Object.entries(models).map(
        ([name, [input = 0, output = 0, cacheRead = 0, cacheCreation = 0]]) => [
          name,
          {
            inputTokens: input,
            outputTokens: output,
            cacheReadInputTokens: cacheRead,
            cacheCreationInputTokens: cacheCreation,
          },
        ],
      ),
    ),
  }
}

async function* streamOf(messages: readonly unknown[]): AsyncIterable<unknown> {
  for (const message of messages) {
    yield await Promise.resolve(message)
  }
}

/** 1件流してから `failure` を投げる流れ。 */
async function* failingStream(failure: Error): AsyncIterable<unknown> {
  yield await Promise.resolve({ type: "system" })
  throw failure
}

/** 流れを最後まで読み、記録された足跡と、流れが投げたものを返す。 */
async function drain(
  messages: AsyncIterable<unknown>,
  signal: AbortSignal = new AbortController().signal,
): Promise<{ readonly footprints: readonly ThrowawayQueryFootprint[]; readonly thrown: unknown }> {
  const footprints: ThrowawayQueryFootprint[] = []
  const watch = {
    kind: "recommendation" as const,
    record: (footprint: ThrowawayQueryFootprint) => {
      footprints.push(footprint)
    },
    now: steppingClock(50),
  }
  let thrown: unknown = undefined
  try {
    for await (const message of recordedMessages(messages, watch, signal)) {
      void message
    }
  } catch (error) {
    thrown = error
  }
  return { footprints, thrown }
}

describe("recordedMessages", () => {
  it("成功の result が届いたら、全モデルのトークンの和（入力はキャッシュを含む）で1回だけ記録する", async () => {
    const { footprints } = await drain(
      streamOf([
        { type: "system", subtype: "init" },
        result("success", { a: [100, 10, 20, 5], b: [7, 3, 0, 0] }),
      ]),
    )

    expect(footprints).toEqual([
      {
        kind: "recommendation",
        startedAt: 1_050,
        durationMs: 50,
        outcome: "success",
        inputTokens: 132,
        outputTokens: 13,
      },
    ])
  })

  it("result の失敗は subtype を結果に写し、知らない subtype は other にする", async () => {
    const known = await drain(streamOf([result("error_max_turns", { a: [1, 2] })]))
    const unknown = await drain(streamOf([result("error_from_the_future", { a: [1, 2] })]))

    expect(known.footprints.map((footprint) => footprint.outcome)).toEqual(["error_max_turns"])
    expect(unknown.footprints.map((footprint) => footprint.outcome)).toEqual(["other"])
  })

  it("result が届かずに投げたら投げ直し、中断していれば aborted、でなければ threw でトークンを持たない", async () => {
    const failure = new Error("起こせなかった")
    const controller = new AbortController()
    controller.abort()

    const threw = await drain(failingStream(failure))
    const aborted = await drain(failingStream(failure), controller.signal)

    expect(threw.thrown).toBe(failure)
    expect(threw.footprints).toEqual([
      { kind: "recommendation", startedAt: 1_050, durationMs: 50, outcome: "threw" },
    ])
    expect(aborted.thrown).toBe(failure)
    expect(aborted.footprints.map((footprint) => footprint.outcome)).toEqual(["aborted"])
  })

  it("投げずに流れが終わったら no-result", async () => {
    const { footprints } = await drain(streamOf([{ type: "assistant" }]))

    expect(footprints.map((footprint) => footprint.outcome)).toEqual(["no-result"])
  })

  it("読み手が result で読むのをやめても、その result で1回だけ記録する", async () => {
    const footprints: ThrowawayQueryFootprint[] = []
    const watch = {
      kind: "welcome-reactions" as const,
      record: (footprint: ThrowawayQueryFootprint) => {
        footprints.push(footprint)
      },
      now: steppingClock(10),
    }

    for await (const message of recordedMessages(
      streamOf([result("success", { a: [5, 1] }), { type: "assistant" }]),
      watch,
      new AbortController().signal,
    )) {
      void message
      break
    }

    expect(footprints.map((footprint) => footprint.outcome)).toEqual(["success"])
  })
})
