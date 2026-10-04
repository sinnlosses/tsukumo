import { describe, expect, it } from "vitest"

import { createDiagnosticBuffer } from "../../../../src/server/diagnostic/core/diagnostic.ts"
import type { DiagnosticEntry } from "../../../../src/shared/diagnostic/diagnostic-record.ts"

const INTERVAL_MS = 5

function footprint(at: number): DiagnosticEntry {
  return { flow: "session-event", at, generation: 1, kind: "partial-utterance" }
}

function startBuffer() {
  const writes: (readonly DiagnosticEntry[])[] = []
  const buffer = createDiagnosticBuffer(
    {
      append: (entries) => {
        writes.push(entries)
      },
      readRange: () => [],
    },
    INTERVAL_MS,
  )
  return { buffer, writes }
}

function waitForInterval(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, INTERVAL_MS * 4))
}

describe("createDiagnosticBuffer", () => {
  it("間隔のあいだに積んだ件を、1回の書き込みにまとめる", async () => {
    const { buffer, writes } = startBuffer()

    buffer.add(footprint(1))
    buffer.add(footprint(2))
    buffer.add(footprint(3))
    expect(writes).toEqual([])
    await waitForInterval()

    expect(writes).toEqual([[footprint(1), footprint(2), footprint(3)]])
  })

  it("flush は待たずに書き、積んだものが無ければ書かない", async () => {
    const { buffer, writes } = startBuffer()

    buffer.add(footprint(1))
    buffer.flush()
    buffer.flush()
    await waitForInterval()

    expect(writes).toEqual([[footprint(1)]])
  })
})
