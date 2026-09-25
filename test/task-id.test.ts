import { describe, expect, it } from "bun:test"
import { fileURLToPath } from "node:url"

import { collectTaskIds } from "../scripts/lib/task-id-repository.ts"
import { collectStrayTaskMentions } from "../scripts/lib/task-mention-repository.ts"
import { findExcessiveTaskIdDuplicates, formatDuplicateTaskId } from "../scripts/task-id.ts"
import { formatStrayTaskMention } from "../scripts/task-mention.ts"

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

// CLAUDE.md「コード・ドキュメントにタスク番号（`T-` + 3桁）を書かない」を、`src/` / `test/` /
// `scripts/` / `docs/`（`docs/history/` を除く）のコメント・テスト名・本文で保つ
// （拾う形・許す範囲は `scripts/task-mention.ts` の冒頭）。
describe("タスク番号の書き込み", () => {
  it("src/・test/・scripts/・docs/ のコメント・テスト名・本文に、許した範囲を超えたタスク番号が無い", () => {
    expect(collectStrayTaskMentions(REPOSITORY_ROOT).map(formatStrayTaskMention)).toEqual([])
  })
})
