// 歯車の「訪問」のオン・オフ（`docs/screen-design.md` 13.6・13.9「設定の歯車」）を、`<select>` に
// 出す値とラベルにする。置き場の理由は `model-label.ts` の冒頭と同じ（読むのは帯だけ、フックを
// 呼ばない部品が読む対応表、表示の整形は契約ではない）。
//
// **`SessionState.visitEnabled` はブールだが、`<select>` の値は文字列**なので、ここで両方向の
// 変換を持つ（色・演出の速さと違い、値そのものはブラウザに保存しない。
// `src/shared/session-event.ts` の `visit-enabled-changed`）。

export type VisitToggleValue = "on" | "off"

/** `<select>` に出す順とラベル。 */
export const VISIT_TOGGLE_LABELS = [
  ["on", "する"],
  ["off", "しない"],
] satisfies readonly (readonly [VisitToggleValue, string])[]

export function visitToggleValueOf(enabled: boolean): VisitToggleValue {
  return enabled ? "on" : "off"
}

/** 外から届いた文字列が {@link VisitToggleValue} のいずれかかどうか。 */
export function isVisitToggleValue(value: string): value is VisitToggleValue {
  return VISIT_TOGGLE_LABELS.some(([candidate]) => candidate === value)
}
