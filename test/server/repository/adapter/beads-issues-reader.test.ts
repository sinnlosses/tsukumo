import { join } from "node:path"

import { range } from "remeda"
import { describe, expect, it } from "vitest"

import {
  CLOSED_TASK_DISPLAY_LIMIT,
  readBeadsIssues,
} from "../../../../src/server/repository/adapter/beads.ts"
import { useBeadsHome } from "../../../fixture/beads-repository.ts"
import { initBeadsIssues, openIssue } from "../../../fixture/task-summary-repository.ts"
import { useTempDir } from "../../../fixture/temp-dir.ts"

// 本物の `bd` を、`HOME` を一時ディレクトリへ向けて起こす（`useBeadsHome`）。
// リポジトリは一時ディレクトリに毎回作り、中身は架空の課題だけにする。

const root = useTempDir("beads-issues-reader")
useBeadsHome(() => join(root(), "home"))

function bodyOf(id: string): Readonly<Record<string, string>> {
  return {
    description: `${id} の架空の説明`,
    acceptance_criteria: `${id} の架空の受け入れ条件`,
    notes: `${id} の架空のメモ`,
  }
}

function closedAtOf(hour: number): string {
  return `2026-01-14T${String(hour).padStart(2, "0")}:00:00Z`
}

describe("readBeadsIssues", () => {
  it(
    "全件を読み、本文は閉じていない課題と閉じた時刻の新しい課題にだけ付ける",
    { timeout: 60_000 },
    async () => {
      const closedIds = range(1, CLOSED_TASK_DISPLAY_LIMIT + 2).map(
        (n) => `t-${String(n).padStart(3, "0")}`,
      )
      const repository = await initBeadsIssues(root(), [
        openIssue("t-100", "未着手", bodyOf("t-100")),
        ...closedIds.map((id, index) =>
          openIssue(id, `済み ${id}`, {
            ...bodyOf(id),
            status: "closed",
            closed_at: closedAtOf(index + 1),
          }),
        ),
      ])

      const outcome = await readBeadsIssues(repository, undefined)
      if (outcome.kind !== "issues") {
        throw new Error("読めるはず")
      }
      const byId = new Map(outcome.issues.map((issue) => [issue.id, issue]))
      const oldestId = "t-001"

      expect(byId.size).toBe(closedIds.length + 1)
      for (const id of ["t-100", ...closedIds.filter((closedId) => closedId !== oldestId)]) {
        expect(byId.get(id)).toMatchObject({
          description: `${id} の架空の説明`,
          acceptanceCriteria: `${id} の架空の受け入れ条件`,
          notes: `${id} の架空のメモ`,
        })
      }
      expect(byId.get(oldestId)).toMatchObject({
        title: `済み ${oldestId}`,
        closedAtEpochMilliseconds: Temporal.Instant.from(closedAtOf(1)).epochMilliseconds,
        description: "",
        acceptanceCriteria: "",
        notes: "",
      })
    },
  )
})
