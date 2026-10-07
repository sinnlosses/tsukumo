import { describe, expect, it, vi } from "vitest"

import type { BeadsOutcome } from "../../../../src/server/repository/adapter/beads.ts"
import {
  readClaimedTaskSteps,
  type ClaimedTaskPorts,
} from "../../../../src/server/repository/adapter/claimed-task.ts"
import type { ProjectSettingsRead } from "../../../../src/shared/repository/project-settings.ts"

// 課題は手で書いた架空のもの。`bd` の実データは使わない。

const CWD = "/work/fictional/wt-a"

const CLAIMED_ISSUES = {
  kind: "issues",
  issues: [
    {
      id: "fic-7",
      title: "架空の課題",
      status: "in_progress",
      labels: [],
      blockedBy: [],
      assignee: "wt-a",
      createdAtEpochMilliseconds: 0,
      closedAtEpochMilliseconds: undefined,
      description: "",
      acceptanceCriteria: "",
      notes: "### 1. 調べる\n### 2. 直す",
      externalRef: undefined,
    },
  ],
} as const satisfies BeadsOutcome

function ports(settings: ProjectSettingsRead, beads: BeadsOutcome) {
  return {
    readProjectSettings: vi.fn(() => Promise.resolve(settings)),
    readBeadsIssues: vi.fn(() => Promise.resolve(beads)),
  } satisfies ClaimedTaskPorts
}

describe("readClaimedTaskSteps", () => {
  it("作業ツリーの名前が着手した課題の段を読む", async () => {
    await expect(
      readClaimedTaskSteps(CWD, ports({ kind: "none" }, CLAIMED_ISSUES)),
    ).resolves.toEqual({ kind: "claimed", taskId: "fic-7", steps: ["調べる", "直す"] })
  })

  it.each([{ kind: "off" }, { kind: "invalid" }] as const)(
    "設定が $kind なら bd を起こさず none",
    async (settings) => {
      const fake = ports(settings, CLAIMED_ISSUES)

      await expect(readClaimedTaskSteps(CWD, fake)).resolves.toEqual({ kind: "none" })
      expect(fake.readBeadsIssues).not.toHaveBeenCalled()
    },
  )

  it.each([{ kind: "failed" }, { kind: "timed-out" }] as const)(
    "bd が $kind なら none",
    async (beads) => {
      await expect(readClaimedTaskSteps(CWD, ports({ kind: "none" }, beads))).resolves.toEqual({
        kind: "none",
      })
    },
  )
})
