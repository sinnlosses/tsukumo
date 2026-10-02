// 疑似セッションの場面ごとの塊の一覧を見分ける判断を検証する。

import { describe, expect, test } from "vitest"

import { sceneBlockKinds } from "../../scripts/lib/scene-catalog.ts"
import { readFakeSession } from "../../src/server/session-driver/adapter/fake-driver.ts"

const session = readFakeSession()
if (session === undefined) {
  throw new Error("test/fixture/fake-session.json が読めない")
}
const kinds = sceneBlockKinds(session)

describe("sceneBlockKinds", () => {
  test("状態のセルを持つ table は report-tool・report-matrix に出る", () => {
    expect(kinds.get("report-tool")).toContain("table(status)")
    expect(kinds.get("report-matrix")).toContain("table(status)")
  })

  test("文字列セルだけの table は report-dimension に出るが、状態の印は付かない", () => {
    expect(kinds.get("report-dimension")).toContain("table")
    expect(kinds.get("report-dimension")).not.toContain("table(status)")
  })

  test("検証結果を持つ場面には checks が出る", () => {
    expect(kinds.get("report-tool")).toContain("checks")
  })
})
