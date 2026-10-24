import { describe, expect, it } from "vitest"

import { collectStrayTaskMentions } from "../../../scripts/document/lib/task-mention-repository.ts"
import { formatStrayTaskMention } from "../../../scripts/document/task-mention.ts"
import { REPOSITORY_ROOT } from "../../../scripts/shared/repository-root.ts"

// `.claude/rules/comments.md`「コード・ドキュメントにタスク番号」の規則を、`src/` / `test/` /
// `scripts/` / `docs/`（`docs/history/` を除く）のコメント・テスト名・本文で保つ
// （拾う形・許す範囲は `findTaskMentions` のコメント）。
describe("タスク番号の書き込み", () => {
  it("src/・test/・scripts/・docs/ のコメント・テスト名・本文に、許した範囲を超えたタスク番号が無い", () => {
    expect(collectStrayTaskMentions(REPOSITORY_ROOT).map(formatStrayTaskMention)).toEqual([])
  })
})
