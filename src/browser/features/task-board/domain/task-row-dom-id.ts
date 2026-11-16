// サイドバーのタスクの行とサイドシートの DOM の id。
// 行は `aria-controls` でサイドシートを指し、サイドシートは閉じたときに行へフォーカスを戻す。

/** 行のボタンの DOM の id（探す欄の `aria-activedescendant` も指す）。 */
export function taskRowDomId(taskId: string): string {
  return `task-row-${taskId}`
}

/** サイドバーのドラフトの段の「仕分ける」の口。分類の場面を閉じたときにフォーカスを戻す。 */
export const SORT_OPEN_DOM_ID = "task-sort-open"

/** サイドシートの `<aside>` の DOM の id。会話の画面に1つだけ置く。 */
export const TASK_SHEET_DOM_ID = "task-sheet"
