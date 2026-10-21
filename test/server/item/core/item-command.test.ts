import { describe, expect, it } from "vitest"

import { itemCommands } from "../../../../src/server/item/core/item-command.ts"
import { FRAME_ERROR_REASON } from "../../../../src/shared/frame.ts"

describe("itemCommands", () => {
  it("4つの行はどれも write で、断る理由は定型文", () => {
    const table = itemCommands({
      addItem: () => Promise.resolve(undefined),
      removeItem: () => Promise.resolve(undefined),
      setSeat: () => Promise.resolve(undefined),
      clearSeat: () => Promise.resolve(undefined),
    })
    expect(Object.values(table).map((row) => [row.kind, row.failure])).toEqual(
      Array.from({ length: 4 }, () => ["write", FRAME_ERROR_REASON.itemEditFailed]),
    )
  })
})
