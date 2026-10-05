// 歯車の「タスク運用」の使う・使わないを、`<select>` に出す値とラベルにする。
//
// 「使わない」はプロジェクトの設定の `tasks: "off"`。「使う」は設定を書き直す（ダイアログで確かめる）ので、値はここで閉じる。

export type TaskOperationValue = "use" | "off"

/** `<select>` に出す順とラベル。 */
export const TASK_OPERATION_LABELS = [
  ["use", "使う"],
  ["off", "使わない"],
] satisfies readonly (readonly [TaskOperationValue, string])[]

export function isTaskOperationValue(value: string): value is TaskOperationValue {
  return TASK_OPERATION_LABELS.some(([candidate]) => candidate === value)
}
