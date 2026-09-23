import { describe, expect, it } from "bun:test"

import { PRE_REQUEST_TURN_ID, splitIntoTurns, turnIdOf } from "../../src/shared/turn.ts"

// 割る関数は型引数で受けるので、記録（`SessionRecord`）の代わりに最小の形で確かめる。
type Item =
  | { readonly kind: "request"; readonly turnId: number }
  | { readonly kind: "note"; readonly text: string }

const request = (turnId: number) => ({ kind: "request", turnId }) as const satisfies Item
const note = (text: string) => ({ kind: "note", text }) as const satisfies Item

describe("splitIntoTurns（記録を依頼の区切りでターンに割る）", () => {
  it("依頼ごとに、次の依頼の手前までの記録をまとめる", () => {
    expect(
      splitIntoTurns<Item>([request(3), note("前の1"), note("前の2"), request(4), note("今回")]),
    ).toEqual([
      { kind: "request", request: request(3), records: [note("前の1"), note("前の2")] },
      { kind: "request", request: request(4), records: [note("今回")] },
    ])
  })

  it("依頼より前の記録は先頭の pre-request にまとめる", () => {
    expect(splitIntoTurns<Item>([note("前の1"), note("前の2"), request(0)])).toEqual([
      { kind: "pre-request", records: [note("前の1"), note("前の2")] },
      { kind: "request", request: request(0), records: [] },
    ])
  })

  it("依頼より前の記録が無ければ pre-request を置かない", () => {
    expect(splitIntoTurns<Item>([request(0)]).map((turn) => turn.kind)).toEqual(["request"])
    expect(splitIntoTurns<Item>([])).toEqual([])
  })

  it("依頼が1件も無ければ、全部が pre-request に入る", () => {
    expect(splitIntoTurns<Item>([note("1"), note("2")])).toEqual([
      { kind: "pre-request", records: [note("1"), note("2")] },
    ])
  })
})

describe("turnIdOf（ターンの通し番号）", () => {
  it("依頼で始まるターンは依頼が持つ番号、依頼より前のまとまりは PRE_REQUEST_TURN_ID", () => {
    const turns = splitIntoTurns<Item>([note("前"), request(7)])

    expect(turns.map(turnIdOf)).toEqual([PRE_REQUEST_TURN_ID, 7])
  })
})
