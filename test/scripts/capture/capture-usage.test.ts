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
    ["capture-view.ts", "--scene", "x", "--stub-rpc", "planUsage.report"],
    ["capture-view.ts", "--scene", "x", "--stub-rpc", "planUsage.report={kind"],
    ["capture-view.ts", "--scene", "x", "--stub-rpc", "planUsage.report@0={}"],
    ["capture-view.ts", "--scene", "x", "--viewport", "10", "--paper-metric"],
    ["capture-view.ts", "--scene", "x", "--viewport", "1000x800"],
    ["capture-view.ts", "--scene", "x", "--paper-metric", "--reveal-at", "500"],
    ["capture-view.ts", "--scene", "x", "--text-length"],
    ["compare-html.ts"],
    ["compare-html.ts", "--foo"],
    ["compare-html.ts", "--html", "a.html", "--topic", "t", "--date", "2026-01-02"],
    ["compare-html.ts", "--html", "a.html", "--scene", "x", "--date", "2026-01-02"],
    ["compare-html.ts", "--html", "a.html", "--scene", "x", "--topic", "t", "--date", "今日"],
    [
      "compare-html.ts",
      "--html",
      "a.html",
      "--scene",
      "x",
      "--topic",
      "t",
      "--date",
      "2026-01-02",
      "--widths",
      "390,abc",
    ],
  ])("%s %s は使い方を出して終了コード 2 で止まる", async (script, ...args) => {
    const result = await runSubprocess("node", [`scripts/capture/${script}`, ...args], {
      cwd: ROOT,
    })
    expect(result.exitCode).toBe(2)
    expect(result.stderr).toContain("使い方")
  })
})
