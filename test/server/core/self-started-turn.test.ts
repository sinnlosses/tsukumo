import { describe, expect, it } from "bun:test"

import { withSelfStartedTurns } from "../../../src/server/core/self-started-turn.ts"
import { type SessionEvent } from "../../../src/shared/session-event.ts"

// イベントはすべて手で書いた架空のもの（docs/coding-standards.md「会話内容の扱い」）。

const INIT: SessionEvent = {
  kind: "session-info",
  sessionId: "fake-session",
  model: "opus",
  permissionMode: "auto",
  slashCommands: [],
  terminalSlashCommands: [],
}
const REQUEST: SessionEvent = { kind: "request", text: "架空の依頼", images: [] }
const FINISHED: SessionEvent = { kind: "turn-finished", outcome: { kind: "completed" } }
const UTTERANCE: SessionEvent = { kind: "utterance", text: "架空の続きの報告" }

/** 包んだ口に `events` を順に流し、外へ出たイベントの kind の並びを返す。 */
function relayedKinds(events: readonly SessionEvent[]): readonly string[] {
  const out: SessionEvent[] = []
  const relay = withSelfStartedTurns((event) => {
    out.push(event)
  })
  for (const event of events) {
    relay(event)
  }
  return out.map((event) => event.kind)
}

describe("withSelfStartedTurns", () => {
  it("依頼で始めたターンの init には何も補わない", () => {
    expect(relayedKinds([REQUEST, INIT, UTTERANCE, FINISHED])).toEqual([
      "request",
      "session-info",
      "utterance",
      "turn-finished",
    ])
  })

  it("ターンが終わったあとに届いた init（知らせで claude が始めた続きのターン）の前に turn-started を補う", () => {
    expect(relayedKinds([REQUEST, INIT, FINISHED, INIT, UTTERANCE, FINISHED])).toEqual([
      "request",
      "session-info",
      "turn-finished",
      "turn-started",
      "session-info",
      "utterance",
      "turn-finished",
    ])
  })

  it("続きのターンの途中の init には重ねて補わない", () => {
    expect(relayedKinds([REQUEST, FINISHED, INIT, INIT, FINISHED])).toEqual([
      "request",
      "turn-finished",
      "turn-started",
      "session-info",
      "session-info",
      "turn-finished",
    ])
  })

  it("記録を持たない依頼（turn-started）で始めたターンの init にも補わない", () => {
    expect(relayedKinds([{ kind: "turn-started" }, INIT, FINISHED])).toEqual([
      "turn-started",
      "session-info",
      "turn-finished",
    ])
  })

  it("最初のターンより前に届いた init には補わない（終わりの来ない「作業中」を作らない）", () => {
    expect(relayedKinds([INIT])).toEqual(["session-info"])
  })
})
