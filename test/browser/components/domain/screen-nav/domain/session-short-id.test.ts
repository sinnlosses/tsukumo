import { describe, expect, it } from "vitest"

import { shortSessionIds } from "../../../../../../src/browser/components/domain/screen-nav/domain/session-short-id.ts"

// ID はすべて作り物（UUID の形だけ借りる）。

describe("shortSessionIds", () => {
  it("先頭2字を大文字にする", () => {
    const ids = shortSessionIds(["fa12cd34-0000", "7b9e0000-1111"])

    expect(ids.get("fa12cd34-0000")).toBe("FA")
    expect(ids.get("7b9e0000-1111")).toBe("7B")
  })

  it("並べる中で2字が重なったものだけ3字に伸ばす", () => {
    const ids = shortSessionIds(["fa12cd34-0000", "fa9e0000-1111", "c3000000-2222"])

    expect(ids.get("fa12cd34-0000")).toBe("FA1")
    expect(ids.get("fa9e0000-1111")).toBe("FA9")
    expect(ids.get("c3000000-2222")).toBe("C3")
  })

  it("同じIDが2度並んでも重なりとは数えない", () => {
    const ids = shortSessionIds(["fa12cd34-0000", "fa12cd34-0000"])

    expect(ids.get("fa12cd34-0000")).toBe("FA")
  })
})
