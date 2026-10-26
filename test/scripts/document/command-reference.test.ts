import { describe, expect, it } from "vitest"

import {
  findCommandReferences,
  findMissingCommandReferences,
  formatMissingCommandReference,
} from "../../../scripts/document/command-reference.ts"

describe("文書が書いている実行コマンド", () => {
  it("pnpm run の名前と node scripts/ のパスを行つきで拾う", () => {
    const found = findCommandReferences(
      "a.md",
      "x\n`pnpm run css-types` と `node scripts/dev/ship.ts`",
    )
    expect(found.map(({ line, command, kind }) => `${line}:${kind}:${command}`)).toEqual([
      "2:pnpm-script:css-types",
      "2:node-script:scripts/dev/ship.ts",
    ])
  })

  it("見本の記号つき・history・md 以外は拾わない", () => {
    expect(findCommandReferences("a.md", "node scripts/<name>.ts")).toEqual([])
    expect(findCommandReferences(["docs", "history", "x.md"].join("/"), "pnpm run old")).toEqual([])
    expect(findCommandReferences("a.ts", "pnpm run old")).toEqual([])
  })

  it("実在しない名前とパスだけを返し、一覧の行に直せる", () => {
    const references = findCommandReferences(
      "a.md",
      "pnpm run test / pnpm run gone / node scripts/ok.ts / node scripts/gone.ts",
    )
    const missing = findMissingCommandReferences(
      references,
      new Set(["test"]),
      (path) => path === "scripts/ok.ts",
    )
    expect(missing.map(formatMissingCommandReference)).toEqual([
      "a.md:1: 実在しないコマンド `pnpm run gone`",
      "a.md:1: 実在しないコマンド `node scripts/gone.ts`",
    ])
  })
})
