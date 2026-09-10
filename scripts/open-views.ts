// 起動中のサイドカーが配っている、3領域をまとめたレイアウトページを、ホスト（Orca）の中に開く。
//
// `bun run start` は起動時に自分でこのページのタブを開く（src/index.ts の main）ので、
// **通常はこの道具を使う必要が無い。** 使うのは、サイドカーは動かしたままタブだけ閉じてしまい、
// 再起動せずに開き直したいときだけ。サイドカー本体からは呼ばれない一度きりの道具なので
// scripts/ に置く。
//
// 使い方: bun run scripts/open-views.ts http://127.0.0.1:7327
//   （URL は `bun run start` が起動時に表示するもの）
//
// **開くのはまとめたページ（LAYOUT_PATH）1つだけ。** 3つのビューは1枚の HTML にまとめてあるので、
// ブラウザタブも1つで足りる（`docs/architecture.md`「3つのビューは1枚のページにまとめる」）。
// 個別のビュー（`/main` `/character` `/sidebar`）はデバッグ用に残っているが、
// 見たいときは Orca 内のブラウザで URL を直接開けばよく、この道具の役目ではない。

import process from "node:process"

import { createOrcaHost } from "../src/orca-host.ts"
import { LAYOUT_PATH } from "../src/view.ts"

const baseUrl = process.argv[2]
if (baseUrl === undefined) {
  process.stderr.write("使い方: bun run scripts/open-views.ts <サイドカーが表示したURL>\n")
  process.exit(2)
}

const host = createOrcaHost()
const layoutUrl = new URL(LAYOUT_PATH, baseUrl).toString()
const result = await host.showView(layoutUrl)

process.stdout.write(
  result.ok ? `開いた: ${layoutUrl}\n` : `開けなかった: ${layoutUrl} — ${result.reason}\n`,
)
