// 端末に書き出す。「描く」層であり、端末に依存する処理をここに閉じ込める（原則3）。
//
// ここは目視でしか確認できないので自動テストの対象にしない
// （docs/coding-standards.md「テスト」節「描画は自動テストで守らない」）。

import process from "node:process"

const DEFAULT_TERMINAL_WIDTH = 80

/** ペイン幅を返す。取得できない環境では既定値にフォールバックする。 */
export function terminalWidth(): number {
  const columns = process.stdout.columns
  return typeof columns === "number" && columns > 0 ? columns : DEFAULT_TERMINAL_WIDTH
}

/** 画面をクリアしてから、行の配列を書き出す。 */
export function draw(lines: readonly string[]): void {
  process.stdout.write("\x1b[2J\x1b[H")
  process.stdout.write(`${lines.join("\n")}\n`)
}
