// 起動中のサイドカーが配っているビューを、ホスト（Orca）の中に開く。
// サイドカー本体からは呼ばれない一度きりの道具なので scripts/ に置く。
//
// 使い方: bun run scripts/open-views.ts http://127.0.0.1:7327
//   （URL は `bun run start <transcript>` が起動時に表示するもの）

import process from "node:process"

import { createOrcaHost } from "../src/orca-host.ts"
import { VIEW_NAMES, viewPath } from "../src/view.ts"

const baseUrl = process.argv[2]
if (baseUrl === undefined) {
  process.stderr.write("使い方: bun run scripts/open-views.ts <サイドカーが表示したURL>\n")
  process.exit(2)
}

const host = createOrcaHost()

// 1つずつ順に開く。まとめて投げるとホスト側でタブの並びが安定しない。
for (const view of VIEW_NAMES) {
  const url = new URL(viewPath(view), baseUrl).toString()
  const result = await host.showView(url)

  process.stdout.write(result.ok ? `開いた: ${url}\n` : `開けなかった: ${url} — ${result.reason}\n`)
}
