// 「タスクの実行」で呼ぶスキルの名前を `localStorage` に持つ。
// 読めない・欠けている値は空へ畳み、空は「固定の文面で送る」を意味する。
// 「/」の付け外しと使える文字の検査は、文面を組む `requestPromptOf` が持つ。

const STORAGE_KEY = "tsukumo-launch-skill:v1"

export function loadLaunchSkill(): string {
  try {
    return localStorage.getItem(STORAGE_KEY) ?? ""
  } catch {
    return ""
  }
}

export function saveLaunchSkill(value: string): void {
  try {
    localStorage.setItem(STORAGE_KEY, value)
  } catch {
    // プライベートウィンドウなどで書けないだけなので、保存できないまま続ける。
  }
}
