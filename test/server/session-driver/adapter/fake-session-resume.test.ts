import { describe, expect, it } from "vitest"

import type { FakeSession } from "../../../../src/server/session-driver/adapter/fake-driver.ts"
import {
  createFakeSessionCatalog,
  readFakeRestoredEvents,
} from "../../../../src/server/session-driver/adapter/fake-session-resume.ts"
import { bundledFakeSession } from "../../../fixture/bundled-fake-session.ts"
import {
  assistantMessage,
  SPEAK_TOOL_FULL_NAME,
  userMessage,
} from "../../../fixture/sdk-message.ts"

const TAG = "tsukumo:架空のパック@7327"

function session(): FakeSession {
  return {
    opening: [],
    turns: [
      { name: "with-resume", resume: "past-1", steps: [] },
      { name: "without-resume", resume: undefined, steps: [] },
      { name: "dangling-resume", resume: "past-missing", steps: [] },
    ],
    pastSessions: [
      {
        sessionId: "past-1",
        messages: [
          userMessage("架空の依頼"),
          assistantMessage([
            {
              type: "tool_use",
              id: "speak-1",
              name: SPEAK_TOOL_FULL_NAME,
              input: { text: "架空のセリフ", expression: "default" },
            },
          ]),
        ],
      },
    ],
    sessionDigests: {},
  }
}

describe("createFakeSessionCatalog", () => {
  it("続きを持つ場面を名指ししたときだけ、その ID を続きにする", async () => {
    expect(await createFakeSessionCatalog(session(), "with-resume").findToResume(TAG)).toBe(
      "past-1",
    )
  })

  it.each([["without-resume"], ["dangling-resume"], ["unknown-scene"], [undefined]])(
    "場面が %s のときは続きを探さない",
    async (scene) => {
      const catalog = createFakeSessionCatalog(session(), scene)

      expect(await catalog.findToResume(TAG)).toBeUndefined()
      expect(await catalog.listChoices(TAG)).toEqual([])
    },
  )
})

describe("readFakeRestoredEvents", () => {
  it("過去の transcript を依頼から始まる並びに組み直す", () => {
    const events = readFakeRestoredEvents(session(), "past-1", ["default"])

    expect(events.map(({ event }) => event.kind)).toEqual(["request", "speech", "turn-finished"])
  })

  it("知らない ID は空", () => {
    expect(readFakeRestoredEvents(session(), "past-missing", ["default"])).toEqual([])
  })
})

describe("同梱の疑似セッション", () => {
  it("どの場面の resume も pastSessions の ID を指している", () => {
    const bundled = bundledFakeSession()
    const ids = bundled.pastSessions.map((past) => past.sessionId)

    expect(ids.length).toBeGreaterThan(0)
    for (const scene of bundled.turns) {
      if (scene.resume !== undefined) {
        expect(ids).toContain(scene.resume)
      }
    }
  })
})
