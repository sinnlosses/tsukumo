// 引数なしの E2E 全件を止める門の判定を検証する。

import { describe, expect, test } from "vitest"

import {
  E2E_FULL_ENVIRONMENT,
  judgeE2eFull,
  shouldTypecheckBeforeE2e,
} from "../../../../scripts/dev/lib/e2e-full-guard.ts"

describe("judgeE2eFull", () => {
  test("引数なしで環境変数も無ければ止めて、案内を返す", () => {
    const judgement = judgeE2eFull([], undefined)
    expect(judgement.kind).toBe("deny")
    expect(judgement).toMatchObject({ message: expect.stringContaining("pnpm run check --full") })
    expect(judgement).toMatchObject({
      message: expect.stringContaining("pnpm run test:e2e test/e2e/"),
    })
  })

  test("単独の -- があるときは、ファイルがあっても止める", () => {
    expect(judgeE2eFull(["--", "test/e2e/a.test.ts"], undefined).kind).toBe("deny")
  })

  test(".test.ts のファイルを渡した実行は通す", () => {
    expect(judgeE2eFull(["test/e2e/a.test.ts"], undefined).kind).toBe("pass")
    expect(judgeE2eFull(["test/e2e/a.test.ts", "--bail=3"], undefined).kind).toBe("pass")
  })

  test("ファイルが無くてもフラグだけの引数は止める", () => {
    expect(judgeE2eFull(["--bail=3"], undefined).kind).toBe("deny")
  })

  test("TSUKUMO_E2E_FULL=1 なら全件でも通す。1以外は通さない", () => {
    expect(judgeE2eFull([], E2E_FULL_ENVIRONMENT.TSUKUMO_E2E_FULL).kind).toBe("pass")
    expect(judgeE2eFull([], "0").kind).toBe("deny")
    expect(judgeE2eFull([], "").kind).toBe("deny")
  })

  test("型検査は、全件の印を立てない（ファイル単位の）呼び出しだけが打つ", () => {
    expect(shouldTypecheckBeforeE2e(undefined)).toBe(true)
    expect(shouldTypecheckBeforeE2e("1")).toBe(false)
  })
})
