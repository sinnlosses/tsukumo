// 両側が画像の前後の塊の見せ方（並べる・切り替え）を `localStorage` に持つ。
// 利用者の端末ごとの好みなので、サーバの状態には置かない。
// 読めない・欠けている値は並べるへ畳む。

export type BeforeAfterView = "side" | "switch"

const DEFAULT_BEFORE_AFTER_VIEW: BeforeAfterView = "side"

const STORAGE_KEY = "tsukumo-before-after-view:v1"

const BEFORE_AFTER_VIEWS = ["side", "switch"] satisfies readonly BeforeAfterView[]

export function loadBeforeAfterView(): BeforeAfterView {
  let raw: string | null = null
  try {
    raw = localStorage.getItem(STORAGE_KEY)
  } catch {
    return DEFAULT_BEFORE_AFTER_VIEW
  }
  return BEFORE_AFTER_VIEWS.find((view) => view === raw) ?? DEFAULT_BEFORE_AFTER_VIEW
}

export function saveBeforeAfterView(view: BeforeAfterView): void {
  try {
    localStorage.setItem(STORAGE_KEY, view)
  } catch {
    // プライベートウィンドウなどで書けないだけなので、保存できないまま続ける。
  }
}
