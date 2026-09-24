// develop/tasks.json の `id` と docs/history/tasks.md の見出し（行頭 `## T-<数字>`）を合わせた集合で、
// タスクIDが重複していないかを見る純粋関数。`scripts/lib/task-id-repository.ts`
// （リポジトリから集める入口）と `test/task-id.test.ts`（0件を保つテスト）が使う。
//
// T-225 は既知の例外として2件まで許す: 登録した直後にアーカイブが `develop/tasks.json` から
// 消し、別の採番がその直後に最大+1で行われて衝突したため `docs/history/tasks.md` に2つ残って
// いる（履歴は書き換えない。経緯は `docs/history/direction.md` の「タスク運用の作り直し」）。

/** ID1件と、その出現回数。 */
export type DuplicateTaskId = {
  readonly id: string
  readonly count: number
}

// 既知の例外ID → 許す出現回数。ここに無いIDは1回だけ許す。
const KNOWN_DUPLICATE_ALLOWANCE = new Map<string, number>([["T-225", 2]])

/**
 * `docs/history/tasks.md` の本文から、見出し行（行頭 `## T-<数字>`）のIDを拾う。
 */
export function extractHeadingTaskIds(text: string): string[] {
  return [...text.matchAll(/^## (T-\d+)/gmu)].flatMap((match) => {
    const id = match[1]
    return id === undefined ? [] : [id]
  })
}

/**
 * IDの一覧から、既知の例外の許容回数を超えて出現したものだけを返す。
 */
export function findExcessiveTaskIdDuplicates(ids: readonly string[]): DuplicateTaskId[] {
  const counts = new Map<string, number>()
  for (const id of ids) {
    counts.set(id, (counts.get(id) ?? 0) + 1)
  }
  return [...counts]
    .filter(([id, count]) => count > (KNOWN_DUPLICATE_ALLOWANCE.get(id) ?? 1))
    .map(([id, count]) => ({ id, count }))
}

/** 重複1件を、一覧に出す1行にする。 */
export function formatDuplicateTaskId(duplicate: DuplicateTaskId): string {
  return `${duplicate.id}: ${duplicate.count}回`
}
