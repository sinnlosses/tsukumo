import { describe, expect, it } from "vitest"

import {
  shellCommandText,
  shellLineKinds,
} from "../../../../../../../../src/browser/components/page/conversation/components/markdown/renderer/shell-line.ts"

describe("shellLineKinds", () => {
  it("`$ ` で始まる行がコマンド、それ以外が出力", () => {
    expect(shellLineKinds("bash", "$ ls\na.txt\n$ pwd\n/tmp")).toEqual([
      "command",
      "output",
      "command",
      "output",
    ])
  })

  it.each(["bash", "sh", "zsh", "console", "shell"])("%s は shell", (language) => {
    expect(shellLineKinds(language, "$ ls")).toEqual(["command"])
  })

  it("shell でない言語・言語なしは分けない", () => {
    expect(shellLineKinds("ts", "$ ls")).toBeUndefined()
    expect(shellLineKinds(undefined, "$ ls")).toBeUndefined()
  })

  it("`$ ` で始まる行が無い shell は分けない", () => {
    expect(shellLineKinds("bash", "ls -la\ncd /tmp")).toBeUndefined()
  })

  it("行末が `\\` のコマンドの次の行はコマンドの続き", () => {
    expect(shellLineKinds("bash", "$ pnpm run \\\n  check\nok")).toEqual([
      "command",
      "command",
      "output",
    ])
  })
})

describe("shellCommandText", () => {
  it("コマンドの行だけを `$ ` を外して連ねる", () => {
    const source = "$ pnpm run \\\n  check\nok\n$ pwd\n/tmp"
    const kinds = shellLineKinds("bash", source)
    expect(kinds === undefined ? "" : shellCommandText(source, kinds)).toBe(
      "pnpm run \\\n  check\npwd",
    )
  })
})
