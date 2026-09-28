// 歯車の「訪問」のオン・オフを、`<select>` に出す値とラベルにする。
//
// `SessionState.visitEnabled` はブールだが `<select>` の値は文字列なので、ここで両方向の変換を持つ。
// 色・演出の速さと違い、値そのものはブラウザに保存せず、サーバへ送る。

export type VisitToggleValue = "on" | "off"

/** `<select>` に出す順とラベル。 */
export const VISIT_TOGGLE_LABELS = [
  ["on", "する"],
  ["off", "しない"],
] satisfies readonly (readonly [VisitToggleValue, string])[]

export function visitToggleValueOf(enabled: boolean): VisitToggleValue {
  return enabled ? "on" : "off"
}

export function isVisitToggleValue(value: string): value is VisitToggleValue {
  return VISIT_TOGGLE_LABELS.some(([candidate]) => candidate === value)
}
