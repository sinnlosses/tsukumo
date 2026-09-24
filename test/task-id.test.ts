import { describe, expect, it } from "bun:test"
import { fileURLToPath } from "node:url"

import { collectTaskIds } from "../scripts/lib/task-id-repository.ts"
import { findExcessiveTaskIdDuplicates, formatDuplicateTaskId } from "../scripts/task-id.ts"

// `develop/tasks.json` の `id` と `docs/history/tasks.md` の見出しを合わせたIDが重複していないかを
// 保つ（T-225 は既知の例外として2件まで許す。理由は `scripts/task-id.ts` の冒頭）。ID は一度
// 発行したら使い回さない前提で、重複は採番のやり直しなど運用の事故を示す。

const REPOSITORY_ROOT = fileURLToPath(new URL("..", import.meta.url))

describe("タスクIDの重複", () => {
  it("既知の例外（T-225）を除いて重複が無い", () => {
    expect(
      findExcessiveTaskIdDuplicates(collectTaskIds(REPOSITORY_ROOT)).map(formatDuplicateTaskId),
    ).toEqual([])
  })
})
