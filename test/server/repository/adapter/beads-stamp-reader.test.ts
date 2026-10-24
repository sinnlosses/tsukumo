import { describe, expect, it } from "vitest"

import {
  createBeadsStampReader,
  type BeadsStampReaders,
  type BeadsWorkspace,
} from "../../../../src/server/repository/adapter/beads.ts"

type Counting = {
  readonly readers: BeadsStampReaders
  readonly calls: { where: number; stamp: number }
  readonly release: () => void
}

/** 呼び出しを数え、`release` を呼ぶまで解けない偽の口。 */
function countingReaders(workspace: BeadsWorkspace): Counting {
  const calls = { where: 0, stamp: 0 }
  const gate = Promise.withResolvers<void>()
  return {
    calls,
    release: () => {
      gate.resolve()
    },
    readers: {
      readWorkspace: async () => {
        calls.where += 1
        await gate.promise
        return workspace
      },
      readStamp: async () => {
        calls.stamp += 1
        await gate.promise
        return `stamp-${calls.stamp}`
      },
    },
  }
}

const FOUND: BeadsWorkspace = { kind: "found", dir: "/fake/.beads" }

describe("createBeadsStampReader の束ね", () => {
  it("同時の2回の読みで bd where も bd vc status も1回", async () => {
    const counting = countingReaders(FOUND)
    const read = createBeadsStampReader("/repo", counting.readers)

    const first = read()
    const second = read()
    counting.release()

    expect(await first).toEqual({ kind: "present", stamp: "stamp-1" })
    expect(await second).toEqual({ kind: "present", stamp: "stamp-1" })
    expect(counting.calls).toEqual({ where: 1, stamp: 1 })
  })

  it("見つかったあとの読みでは bd where を打たない", async () => {
    const counting = countingReaders(FOUND)
    counting.release()
    const read = createBeadsStampReader("/repo", counting.readers)

    await read()
    await read()

    expect(counting.calls).toEqual({ where: 1, stamp: 2 })
  })

  it("読みが終わったあとの次の読みは bd vc status を打ち直す", async () => {
    const counting = countingReaders(FOUND)
    counting.release()
    const read = createBeadsStampReader("/repo", counting.readers)

    expect(await read()).toEqual({ kind: "present", stamp: "stamp-1" })
    expect(await read()).toEqual({ kind: "present", stamp: "stamp-2" })
  })

  it(".beads が見つからないうちは読むたびに bd where を打つ", async () => {
    const counting = countingReaders({ kind: "missing" })
    counting.release()
    const read = createBeadsStampReader("/repo", counting.readers)

    expect(await read()).toEqual({ kind: "missing" })
    await read()

    expect(counting.calls).toEqual({ where: 2, stamp: 0 })
  })
})
