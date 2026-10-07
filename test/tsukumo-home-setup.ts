// 単体テストが利用者の `~/.tsukumo/` へ書かないよう、既定のホームを実行ごとの一時ディレクトリへ向ける。

import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import process from "node:process"

export default function setup(): () => void {
  const home = mkdtempSync(join(tmpdir(), "tsukumo-test-home-"))
  process.env.TSUKUMO_HOME = home
  return () => {
    rmSync(home, { recursive: true, force: true })
  }
}
