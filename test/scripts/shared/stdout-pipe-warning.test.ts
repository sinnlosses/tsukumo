import { describe, expect, it } from "vitest"

import { stdoutPipeWarning } from "../../../scripts/shared/stdout-pipe-warning.ts"

describe("標準出力がパイプのときの警告", () => {
  it("パイプなら背景に回す書き方を添えた警告を返す", () => {
    expect(stdoutPipeWarning({ isFIFO: () => true })).toContain("> ログ 2>&1 &")
  })

  it("パイプでなければ（ファイル・端末）警告しない", () => {
    expect(stdoutPipeWarning({ isFIFO: () => false })).toBeUndefined()
  })
})
