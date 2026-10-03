// 迎える口で札を始めるキー（`1`〜`3`）・入力欄へ移るキー（`/`）・前のやり取りを見るキー（`←`）の読み取り。

export type WelcomeKey =
  | { readonly kind: "card"; readonly index: number }
  | { readonly kind: "write" }
  | { readonly kind: "previous" }

export type WelcomeKeyEvent = {
  readonly key: string
  readonly metaKey: boolean
  readonly ctrlKey: boolean
  readonly altKey: boolean
  readonly isComposing: boolean
  readonly target: EventTarget | null
}

const EDITABLE = "input, textarea, select, [contenteditable]"

/** 入力要素の中・変換中・修飾キー付きは入力とブラウザに譲る。 */
export function welcomeKeyOf(event: WelcomeKeyEvent): WelcomeKey | undefined {
  if (event.isComposing || event.metaKey || event.ctrlKey || event.altKey) {
    return undefined
  }
  if (event.target instanceof Element && event.target.closest(EDITABLE) !== null) {
    return undefined
  }
  switch (event.key) {
    case "1":
    case "2":
    case "3":
      return { kind: "card", index: Number(event.key) - 1 }
    case "/":
      return { kind: "write" }
    case "ArrowLeft":
      return { kind: "previous" }
    default:
      return undefined
  }
}
