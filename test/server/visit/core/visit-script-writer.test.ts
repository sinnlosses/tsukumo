import { describe, expect, it } from "bun:test"

import {
  createVisitScriptWriter,
  type VisitScriptDraft,
  type VisitScriptWriterPorts,
} from "../../../../src/server/visit/core/visit-script-writer.ts"
import {
  type VisitCast,
  type VisitScriptQuery,
} from "../../../../src/server/visit/core/visit-script.ts"
import { UNKNOWN_ACHIEVEMENT } from "../../../../src/shared/achievement.ts"
import { type VisitScript } from "../../../../src/shared/character-visit.ts"

// 人格・依頼・台本はすべて手で書いた架空のもの（docs/coding-standards.md「会話内容の扱い」）。

const CAST: VisitCast = {
  host: { persona: "架空のあるじの人格", expressions: [{ name: "default", label: "default" }] },
  guest: { persona: "架空の客の人格", expressions: [{ name: "default", label: "default" }] },
}

const DRAFT: VisitScriptDraft = {
  host: "host",
  guest: "guest",
  excerpt: { request: "架空の依頼", speeches: [], waitingOn: ["架空の待ち"] },
  waitedMs: 90_000,
}

const WRITTEN = {
  lines: [
    { speaker: "guest", expression: "default", text: "架空の一言目" },
    { speaker: "host", expression: "default", text: "架空の返事" },
    { speaker: "guest", expression: "default", text: "架空の二言目" },
  ],
} as const satisfies { readonly lines: VisitScript }

function ports(overrides: Partial<VisitScriptWriterPorts> = {}): VisitScriptWriterPorts {
  return {
    readCast: () => ({ kind: "found", cast: CAST }),
    readAchievement: () => Promise.resolve(UNKNOWN_ACHIEVEMENT),
    localTime: () => "14:05",
    query: () => Promise.resolve(WRITTEN),
    ...overrides,
  }
}

describe("createVisitScriptWriter", () => {
  it("材料を集めて query に渡し、検査を通った台本を written で返す", async () => {
    const queries: VisitScriptQuery[] = []
    const write = createVisitScriptWriter(
      ports({
        query: (query) => {
          queries.push(query)
          return Promise.resolve(WRITTEN)
        },
      }),
    )

    const outcome = await write(DRAFT, new AbortController().signal)

    expect(outcome).toEqual({ kind: "written", script: WRITTEN.lines })
    expect(queries).toHaveLength(1)
    expect(queries[0]?.prompt).toContain("架空の待ち")
  })

  it("形の崩れ・query の失敗・材料の失敗・パックが見つからないときは failed", async () => {
    const queried: string[] = []
    for (const overrides of [
      { query: () => Promise.resolve({ lines: [] }) },
      { query: () => Promise.reject(new Error("架空の失敗")) },
      { readAchievement: () => Promise.reject(new Error("架空の失敗")) },
      {
        readCast: () => ({ kind: "missing" }) as const,
        query: () => {
          queried.push("called")
          return Promise.resolve(WRITTEN)
        },
      },
    ] satisfies Partial<VisitScriptWriterPorts>[]) {
      const write = createVisitScriptWriter(ports(overrides))
      expect(await write(DRAFT, new AbortController().signal)).toEqual({ kind: "failed" })
    }
    expect(queried).toEqual([])
  })

  it("中断されたら、query が返らなくても待たずに failed。query にも中断が伝わる", async () => {
    const signals: AbortSignal[] = []
    const write = createVisitScriptWriter(
      ports({
        query: (_query, signal) => {
          signals.push(signal)
          return new Promise(() => {})
        },
      }),
    )
    const controller = new AbortController()

    const outcome = write(DRAFT, controller.signal)
    // 材料を読み終えて query まで進むのを待ってから中断する。
    await new Promise((resolve) => {
      setImmediate(resolve)
    })
    controller.abort()

    expect(await outcome).toEqual({ kind: "failed" })
    expect(signals[0]?.aborted).toBe(true)
  })
})
