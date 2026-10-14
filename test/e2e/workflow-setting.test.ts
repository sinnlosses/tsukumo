import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"

import { describe, expect, it } from "vitest"

import { runSubprocess } from "../fixture/subprocess.ts"
import { useScenarioRun } from "./scenario-run.ts"

// 歯車の設定の「ワークフロー」の面（docs/architecture/testing.md「E2E のシナリオの一覧」）。
// 場面は名指しせず（`opening` のまま）。部屋を開いたあと cwd を git のリポジトリにして `.tw/config.toml` を置き、
// 画面で受け入れ役を選ぶと、取り込んだワークフローの `tw config set` を通ってファイルの行が変わることを確かめる。
// 期待値は撮らず、`<select>` の value とファイルの中身で判定する。

const run = useScenarioRun()

/** 疑似セッションの `opening` の `session-info` が流すエージェントの全名。 */
const ACCEPTOR = "tsukumo-workflow:acceptor"

describe("ワークフローの設定", () => {
  it("歯車からワークフローの面を開き、受け入れ役を選ぶと cwd の .tw/config.toml に書かれる", async () => {
    const room = await run.open({
      scenario: "workflow-setting-acceptor",
      scene: "none",
      viewport: "wide",
      domRoots: [],
    })
    expect((await runSubprocess("git", ["init", "-q"], { cwd: room.cwd })).exitCode).toBe(0)
    mkdirSync(join(room.cwd, ".tw"), { recursive: true })
    const configPath = join(room.cwd, ".tw", "config.toml")
    writeFileSync(configPath, 'verify = "なし"\nstore = "beads"\n', "utf8")

    await room.page.locator('button[aria-label="設定"][aria-haspopup="dialog"]').click()
    const dialog = room.page.getByRole("dialog", { name: "設定" })
    const acceptor = dialog.getByRole("combobox", { name: "受け入れ役" })
    // 時計が止まっているので、読み取りの応答を React Query が配るのに要るタイマーは応答のあとで進める。
    await room.revealAfterResponse(acceptor, {
      response: "workflowSetting/read",
      baseline: {
        kind: "after-act",
        act: () => dialog.getByRole("button", { name: "ワークフロー" }).click(),
      },
    })
    expect(await acceptor.inputValue()).toBe("既定")

    await acceptor.selectOption(ACCEPTOR)

    // 書き込みはサーバが `tw config set` で済ませるので、ファイルは実時間で待つ。
    await expect
      .poll(() => readFileSync(configPath, "utf8"), { timeout: 10_000 })
      .toContain(`acceptor = "${ACCEPTOR}"`)
    const written = readFileSync(configPath, "utf8")
    expect(written).toContain("[parts]")
    expect(written).toContain('verify = "なし"')
    // 画面は返った面で描き直す。返りを配るタイマーは止まった時計の上にあるので、少しずつ進めて待つ。
    await expect
      .poll(async () => {
        await room.page.clock.runFor(50)
        return acceptor.inputValue()
      })
      .toBe(ACCEPTOR)
  })
})
