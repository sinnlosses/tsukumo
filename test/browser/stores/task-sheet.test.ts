import { afterEach, describe, expect, it } from "vitest"

import { useTaskSheet } from "../../../src/browser/stores/task-sheet.ts"

afterEach(() => {
  useTaskSheet.setState(useTaskSheet.getInitialState(), true)
})

function store(): ReturnType<typeof useTaskSheet.getState> {
  return useTaskSheet.getState()
}

describe("useTaskSheet", () => {
  it("toggle は閉じていれば開き、開いている同じタスクなら閉じ、ほかのタスクならそちらへ移る", () => {
    store().toggle("X-001")
    expect(store().sheet).toEqual({ kind: "open", id: "X-001" })

    store().toggle("X-002")
    expect(store().sheet).toEqual({ kind: "open", id: "X-002" })

    store().toggle("X-002")
    expect(store().sheet).toEqual({ kind: "closed" })
  })

  it("step は order の隣へ移り、端では止まる", () => {
    store().setOrder(["X-001", "X-002", "X-003"])
    store().open("X-002")

    store().step(1)
    expect(store().sheet).toEqual({ kind: "open", id: "X-003" })
    store().step(1)
    expect(store().sheet).toEqual({ kind: "open", id: "X-003" })
    store().step(-1)
    store().step(-1)
    store().step(-1)
    expect(store().sheet).toEqual({ kind: "open", id: "X-001" })
  })

  it("jump は直前のタスクを previousId に持ち、back で戻る。どちらも focusSignal を増やす", () => {
    store().open("X-001")

    store().jump("X-005")
    expect(store().sheet).toEqual({ kind: "open", id: "X-005", previousId: "X-001" })
    expect(store().focusSignal).toBe(1)

    store().back()
    expect(store().sheet).toEqual({ kind: "open", id: "X-001" })
    expect(store().focusSignal).toBe(2)
  })

  it.each([
    ["open", () => store().open("X-003")],
    ["step", () => store().step(1)],
    ["close", () => store().close()],
  ])("%s は previousId を捨てる", (_, act) => {
    store().setOrder(["X-001", "X-005", "X-003"])
    store().open("X-001")
    store().jump("X-005")

    act()

    const { sheet } = store()
    expect(sheet.kind === "open" ? sheet.previousId : undefined).toBeUndefined()
  })
})
