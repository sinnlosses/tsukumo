import { describe, expect, it } from "vitest"

import type { DiagnosticLog } from "../../src/server/diagnostic/core/diagnostic.ts"
import type { DiagnosticEntry } from "../../src/shared/diagnostic/diagnostic-record.ts"
import { wireDiagnostic } from "../../src/wiring/diagnostic.ts"
import { NOOP_CHAT_ARCHIVE } from "../fixture/chat.ts"

describe("wireDiagnostic", () => {
  it("reportRecommendationPressed は押した札の種類だけの足跡を1行書く", () => {
    const entries: DiagnosticEntry[] = []
    const log: DiagnosticLog = {
      append: (added) => {
        entries.push(...added)
      },
      readRange: () => [],
    }
    const { commands } = wireDiagnostic(
      {
        cwd: "/fictional",
        now: () => 1_000,
        inheritedEnv: {},
        driver: { kind: "sdk" },
        chatArchive: NOOP_CHAT_ARCHIVE,
        throwawayQuery: () => undefined,
      },
      log,
    )

    commands.reportRecommendationPressed("task")

    expect(entries).toEqual([{ flow: "recommendation-pressed", at: 1_000, kind: "task" }])
  })
})
