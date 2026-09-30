// `pnpm run check` が落ちた重い段を名指しする行の組み立てを検証する。

import { describe, expect, test } from "vitest"

import { describeFailedStages } from "../../scripts/lib/check-failure.ts"

describe("describeFailedStages", () => {
  test("全段が通ったときは空", () => {
    expect(
      describeFailedStages([
        { name: "test", status: 0 },
        { name: "test:e2e", status: 0 },
      ]),
    ).toEqual([])
  })

  test("落ちた段だけを名前と終了コードの1行にする", () => {
    expect(
      describeFailedStages([
        { name: "test", status: 0 },
        { name: "test:e2e", status: 2 },
      ]),
    ).toEqual(["test:e2e が終了コード 2 で落ちた"])
  })

  test("複数落ちたときは入力の順に並べる", () => {
    expect(
      describeFailedStages([
        { name: "test", status: 1 },
        { name: "test:e2e", status: 2 },
      ]),
    ).toEqual(["test が終了コード 1 で落ちた", "test:e2e が終了コード 2 で落ちた"])
  })
})
