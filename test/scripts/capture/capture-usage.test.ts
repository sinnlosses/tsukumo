// 崩れた引数のとき、ブラウザも tsukumo も起こす前に使い方を出して終了コード 2 で止まることを見る。

import { resolve } from "node:path"

import { describe, expect, test } from "vitest"

import { runSubprocess } from "../../fixture/subprocess.ts"

const ROOT = resolve(".")

describe("capture の入口の崩れた引数", () => {
  test.each([
    ["capture-catalog.ts", "--help"],
    ["capture-catalog.ts", "--foo", "x"],
    ["capture-catalog.ts", "--only"],
    ["capture-view.ts"],
    ["capture-view.ts", "--foo"],
    ["capture-view.ts", "--scene", "x", "--type", "textarea"],
    ["capture-view.ts", "--scene", "x", "--type", "textarea", "--click", "b"],
    ["capture-view.ts", "--scene", "x", "--advance", "0"],
    ["capture-view.ts", "--scene", "x", "--press"],
    ["capture-view.ts", "--scene", "x", "--size", "10"],
    ["capture-view.ts", "--scene", "x", "--until-step", "0"],
    ["capture-view.ts", "--scene", "x", "--reveal-at", "0"],
    ["capture-view.ts", "--scene", "x", "--reveal-at", "abc"],
    ["capture-view.ts", "http://localhost:1/", "--reveal-at", "500"],
    ["capture-view.ts", "--scene", "x", "--reveal-at", "500", "--wait-for", "p"],
    ["capture-view.ts", "--scene", "x", "--reveal-at", "500", "--advance", "100"],
    ["capture-view.ts", "http://localhost:1/", "http://localhost:2/"],
  ])("%s %s は使い方を出して終了コード 2 で止まる", async (script, ...args) => {
    const result = await runSubprocess("node", [`scripts/capture/${script}`, ...args], {
      cwd: ROOT,
    })
    expect(result.exitCode).toBe(2)
    expect(result.stderr).toContain("使い方")
  })
})
