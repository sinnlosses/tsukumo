import { describe, expect, it } from "vitest"

import type { SessionEvent } from "../../../src/shared/session/session-event.ts"
import { applySessionEvent } from "../../../src/shared/session/session-fold.ts"
import {
  INITIAL_SESSION_STATE,
  type SessionState,
} from "../../../src/shared/session/session-state.ts"
import { reportEvent } from "../../fixture/report-event.ts"
import { requestEvent } from "../../fixture/session-event.ts"

const TURN_FINISHED: SessionEvent = { kind: "turn-finished", outcome: { kind: "completed" } }
const SESSION_ENDED: SessionEvent = { kind: "session-ended", reason: "架空の終わり" }
const CLEARED: SessionEvent = { kind: "conversation-cleared" }
const BACKGROUND_STARTED: SessionEvent = {
  kind: "background-tasks-changed",
  tasks: [{ taskId: "fictional-task", kind: "agent", description: "架空の委譲" }],
}
const DRAFTING: SessionEvent = { kind: "report-drafting", toolUseId: "toolu_r1" }

describe("SessionState の turn と sdkTurn の組", () => {
  it.each<[string, readonly SessionEvent[]]>([
    ["依頼より先にセッションが終わる", [SESSION_ENDED, SESSION_ENDED]],
    [
      "依頼から本文・レポートを経て終わる",
      [
        requestEvent(),
        { kind: "utterance", text: "架空の本文" },
        DRAFTING,
        reportEvent({ toolUseId: "toolu_r1" }),
        TURN_FINISHED,
        TURN_FINISHED,
      ],
    ],
    [
      "バックグラウンドタスクが残ったまま turn-finished が先に届き、脇の話と続きのターンが来る",
      [
        requestEvent(),
        BACKGROUND_STARTED,
        TURN_FINISHED,
        { kind: "aside", text: "架空の問い", images: [] },
        { kind: "speech", text: "架空の答え", expression: "default" },
        TURN_FINISHED,
        { kind: "turn-resumed" },
        TURN_FINISHED,
      ],
    ],
    [
      "走っている間と終わったあとに /clear する",
      [requestEvent(), DRAFTING, CLEARED, TURN_FINISHED, CLEARED, requestEvent()],
    ],
    [
      "記録を持たないターンがセッションの終わりで閉じる",
      [{ kind: "turn-started" }, DRAFTING, SESSION_ENDED, SESSION_ENDED],
    ],
    [
      "閉じたあとに本文・レポートの書きかけが届く",
      [
        requestEvent(),
        TURN_FINISHED,
        { kind: "utterance", text: "架空の遅れた本文" },
        DRAFTING,
        { kind: "tool-finished", toolUseId: "toolu_r1", isError: false, content: "" },
      ],
    ],
  ])("%s: sdkTurn が開いているのは turn が running のときだけ", (_label, events) => {
    const states = events.reduce<readonly SessionState[]>(
      (folded, event) => [
        ...folded,
        applySessionEvent(folded.at(-1) ?? INITIAL_SESSION_STATE, event, 0),
      ],
      [INITIAL_SESSION_STATE],
    )

    const broken = states.filter(
      (state) => (state.sdkTurn.kind === "open") !== (state.turn.kind === "running"),
    )
    expect(broken.map(({ turn, sdkTurn }) => [turn.kind, sdkTurn.kind])).toEqual([])
  })
})
