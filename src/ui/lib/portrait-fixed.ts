// 立ち絵を動かすか固定するか。使う人の設定で `localStorage` に持つ
// （`src/ui/features/layout/split.ts` の書き方に倣う）。**立ち絵の動きの実装がここを読んで、固定なら
// 動きを適用しない。** 既定は可動（`false`。`docs/requirements.md` 4.3「立ち絵は動くが話さない」）。

const STORAGE_KEY = "tsukumo-portrait-fixed"

export function loadPortraitFixed(): boolean {
  let raw: string | null = null
  try {
    raw = localStorage.getItem(STORAGE_KEY)
  } catch {
    return false
  }
  if (raw === null) {
    return false
  }

  try {
    const parsed: unknown = JSON.parse(raw)
    return typeof parsed === "boolean" ? parsed : false
  } catch {
    // 保存値が JSON として壊れている。既定（可動）に落ちる。
    return false
  }
}

export function savePortraitFixed(value: boolean): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(value))
  } catch {
    // プライベートウィンドウなどで書けないだけなので、保存できないまま続ける。
  }
}
