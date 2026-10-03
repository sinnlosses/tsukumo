/**
 * 押したことにするキー（WAI-ARIA の button パターンと同じ Enter と Space）。
 * `<button>` と違って `role="button"` の要素にはブラウザが click を送らないので、キーボードで押す道は自分で開ける。
 */
export function isActivationKey(key: string): boolean {
  return key === "Enter" || key === " "
}
