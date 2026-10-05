import { fileURLToPath } from "node:url"

import { describe, expect, it } from "vitest"

import { collectStrayTaskMentions } from "../scripts/lib/task-mention-repository.ts"
import { formatStrayTaskMention } from "../scripts/task-mention.ts"

const REPOSITORY_ROOT = fileURLToPath(new URL("..", import.meta.url))

// CLAUDE.md「コード・ドキュメントにタスク番号（`T-` + 3桁、または GitHub の Issue 番号 `GH-<n>`）を
// 書かない」を、`src/` / `test/` /
// `scripts/` / `docs/` / `story/`（`docs/history/` を除く）のコメント・テスト名・本文で保つ
// （拾う形・許す範囲は `findTaskMentions` のコメント）。
describe("タスク番号の書き込み", () => {
  it("src/・test/・scripts/・docs/・story/ のコメント・テスト名・本文に、許した範囲を超えたタスク番号が無い", () => {
    expect(collectStrayTaskMentions(REPOSITORY_ROOT).map(formatStrayTaskMention)).toEqual([])
  })
})
