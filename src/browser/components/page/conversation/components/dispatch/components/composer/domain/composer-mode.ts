// 入力欄の面をどちらで出すか（素の `<textarea>` か、マークダウンエディタか）を `localStorage` に持つ。
// 利用者の端末ごとの好みなので、サーバの状態には置かない。
// 読めない・欠けている値は `<textarea>` へ畳む。

export type ComposerMode = "plain" | "markdown"

export const DEFAULT_COMPOSER_MODE: ComposerMode = "plain"

const STORAGE_KEY = "tsukumo-composer-mode:v1"

const COMPOSER_MODES = ["plain", "markdown"] satisfies readonly ComposerMode[]

export function loadComposerMode(): ComposerMode {
  let raw: string | null = null
  try {
    raw = localStorage.getItem(STORAGE_KEY)
  } catch {
    return DEFAULT_COMPOSER_MODE
  }
  return COMPOSER_MODES.find((mode) => mode === raw) ?? DEFAULT_COMPOSER_MODE
}

export function saveComposerMode(mode: ComposerMode): void {
  try {
    localStorage.setItem(STORAGE_KEY, mode)
  } catch {
    // プライベートウィンドウなどで書けないだけなので、保存できないまま続ける。
  }
}
