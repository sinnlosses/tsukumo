import { describe, expect, it } from "bun:test"

import { parseServerFrame, PROTOCOL_VERSION } from "../../src/shared/frame.ts"
import { INITIAL_SESSION_STATE } from "../../src/shared/session-state.ts"

// フレームの中身（state / events）は封筒どまりの検証で、union は TS の型のまま
// （2026-09-13 決定。docs/design.md 4章）。ここで確かめるのはその封筒。
describe("parseServerFrame（受け付ける形）", () => {
  it("hello を受け付け、版と状態がそのまま読める", () => {
    const frame = parseServerFrame({
      type: "hello",
      protocolVersion: PROTOCOL_VERSION,
      sessionId: "s-1",
      state: INITIAL_SESSION_STATE,
    })

    expect(frame?.type).toBe("hello")
    expect(frame).toEqual({
      type: "hello",
      protocolVersion: PROTOCOL_VERSION,
      sessionId: "s-1",
      state: INITIAL_SESSION_STATE,
    })
  })

  it("events と error を受け付ける（error の commandId は無くてよい）", () => {
    expect(
      parseServerFrame({
        type: "events",
        events: [
          { at: 1000, event: { kind: "speech", text: "架空のセリフ", expression: "default" } },
        ],
      }),
    ).toEqual({
      type: "events",
      events: [
        { at: 1000, event: { kind: "speech", text: "架空のセリフ", expression: "default" } },
      ],
    })

    expect(parseServerFrame({ type: "error", reason: "依頼の形式が正しくない" })).toEqual({
      type: "error",
      commandId: undefined,
      reason: "依頼の形式が正しくない",
    })
  })

  it("refresh を受け付ける（取り直す先は page と style の2つだけ）", () => {
    expect(parseServerFrame({ type: "refresh", target: "page" })).toEqual({
      type: "refresh",
      target: "page",
    })
    expect(parseServerFrame({ type: "refresh", target: "style" })).toEqual({
      type: "refresh",
      target: "style",
    })
  })
})

describe("parseServerFrame（落とす形）", () => {
  it("知らない type・封筒の欠けた形は undefined", () => {
    expect(parseServerFrame({ type: "greeting" })).toBeUndefined()
    expect(
      parseServerFrame({ type: "hello", sessionId: "s-1", state: INITIAL_SESSION_STATE }),
    ).toBeUndefined()
    expect(
      parseServerFrame({ type: "hello", protocolVersion: "1", sessionId: "s-1", state: {} }),
    ).toBeUndefined()
    expect(parseServerFrame({ type: "events", events: [{ at: 1 }] })).toBeUndefined()
    expect(parseServerFrame({ type: "refresh", target: "everything" })).toBeUndefined()
    expect(parseServerFrame(null)).toBeUndefined()
  })
})
