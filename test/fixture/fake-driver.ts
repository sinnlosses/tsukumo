import { startFakeSession } from "../../src/server/session-driver/adapter/fake-driver.ts"
import {
  FAKE_DEFAULT_EFFORT,
  FAKE_MODEL_EFFORT_SUPPORT,
} from "../../src/server/session-driver/adapter/fake-fixed-reply.ts"
import type {
  FakeSession,
  FakeSessionScene,
  FakeSessionStep,
} from "../../src/server/session-driver/adapter/fake-session.ts"
import type { SessionDriver } from "../../src/server/session-driver/core/session-driver.ts"
import { BUILTIN_SESSION_DEFAULT } from "../../src/shared/session/session-default.ts"
import type { SessionEvent } from "../../src/shared/session/session-event.ts"

// 疑似セッションは手で書いた架空の会話（fixture/fake-session/）。実物の transcript は
export const FAKE_SESSION = {
  opening: [
    {
      afterMs: 0,
      waitForAnswer: false,
      event: { kind: "speech", text: "架空の挨拶", expression: "default" },
    },
  ],
  turns: [
    {
      name: "架空の場面1",
      resume: undefined,
      steps: [
        { afterMs: 0, waitForAnswer: false, event: { kind: "utterance", text: "架空の本文" } },
        {
          afterMs: 0,
          waitForAnswer: false,
          event: { kind: "turn-finished", outcome: { kind: "completed" } },
        },
      ],
    },
    {
      name: "架空の場面2",
      resume: undefined,
      steps: [
        { afterMs: 0, waitForAnswer: false, event: { kind: "utterance", text: "架空の本文2" } },
      ],
    },
  ],
  pastSessions: [],
  sessionDigests: {
    "fake-other": {
      kind: "known",
      requestCount: 2,
      summary: "架空の要約",
      remaining: undefined,
      lastLine: "架空のセリフ",
    },
  },
  usageReview: { review: [], proposal: [] },
} as const

/** 既定のまま起こしたセッションが、ターンの頭で見届ける3つ。 */
export function confirmedAtTurnStart(): readonly SessionEvent[] {
  return [
    { kind: "setting-confirmed", setting: "model", value: BUILTIN_SESSION_DEFAULT.model },
    { kind: "setting-confirmed", setting: "effort", value: FAKE_DEFAULT_EFFORT },
    {
      kind: "setting-confirmed",
      setting: "permissionMode",
      value: BUILTIN_SESSION_DEFAULT.permissionMode,
    },
  ]
}

/** 起こした直後に流れる4件（プラン・effort の対応・既定の effort・opening の場面）。 */
export const STARTUP_EVENTS: readonly SessionEvent[] = [
  { kind: "plan", plan: "Claude Max" },
  { kind: "model-effort-support", models: FAKE_MODEL_EFFORT_SUPPORT },
  { kind: "effort-changed", effort: FAKE_DEFAULT_EFFORT },
  { kind: "speech", text: "架空の挨拶", expression: "default" },
]

export function collect(): {
  readonly events: SessionEvent[]
  readonly onEvent: (e: SessionEvent) => void
} {
  const events: SessionEvent[] = []
  return { events, onEvent: (event) => events.push(event) }
}

export function sessionOfOnly(
  opening: readonly FakeSessionStep[],
  turns: readonly FakeSessionScene[],
): FakeSession {
  return {
    opening,
    turns,
    pastSessions: [],
    sessionDigests: {},
    usageReview: { review: [], proposal: [] },
  }
}

export function startWithoutScene(
  session: FakeSession,
  onEvent: (event: SessionEvent) => void,
): SessionDriver {
  return startFakeSession({
    session,
    scene: undefined,
    sceneUntil: undefined,
    sessionDefault: BUILTIN_SESSION_DEFAULT,
    firstViewer: Promise.resolve(),
    expressions: [],
    onEvent,
  })
}

export function startOnScene(
  session: FakeSession,
  onEvent: (event: SessionEvent) => void,
  scene: string,
  sceneUntil: number | undefined,
): SessionDriver {
  return startFakeSession({
    session,
    scene,
    sceneUntil,
    sessionDefault: BUILTIN_SESSION_DEFAULT,
    firstViewer: Promise.resolve(),
    expressions: [],
    onEvent,
  })
}

export function tick(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 10))
}
