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

  // 実機の `tw` は schema 2 を返さない（取り込みの `tw` が `--version` を知らない）ので、読み取りの応答だけを schema 2 の面に差し替える。
  // 書き込みは本物の `tw config set` まで届き、知らないキーとして断られる理由が欄の下に出ることで、往復を確かめる。
  it("並びの欄で候補を足すと、並び全体の書き込みが tw まで届く", async () => {
    const room = await run.open({
      scenario: "workflow-setting-steps",
      scene: "none",
      viewport: "wide",
      domRoots: [],
    })
    expect((await runSubprocess("git", ["init", "-q"], { cwd: room.cwd })).exitCode).toBe(0)
    mkdirSync(join(room.cwd, ".tw"), { recursive: true })
    writeFileSync(join(room.cwd, ".tw", "config.toml"), 'verify = "なし"\n', "utf8")
    await room.page.route("**/rpc/workflowSetting/read**", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          json: {
            kind: "available",
            repository: { worktreeName: "架空の作業ツリー", configPath: "/架空/.tw/config.toml" },
            defaultWord: "",
            noneWord: "",
            fields: [
              {
                kind: "steps",
                key: "steps",
                label: "スキルの並び",
                description: "架空の説明",
                values: [
                  { value: "架空:甲", label: "甲", description: "" },
                  { value: "架空:乙", label: "乙", description: "" },
                ],
                current: ["架空:甲"],
              },
            ],
          },
        }),
      }),
    )

    await room.page.locator('button[aria-label="設定"][aria-haspopup="dialog"]').click()
    const dialog = room.page.getByRole("dialog", { name: "設定" })
    const adder = dialog.getByRole("combobox", { name: "スキルの並びに足す" })
    await room.revealAfterResponse(adder, {
      response: "workflowSetting/read",
      baseline: {
        kind: "after-act",
        act: () => dialog.getByRole("button", { name: "ワークフロー" }).click(),
      },
    })

    await adder.selectOption("架空:乙")

    await expect
      .poll(
        async () => {
          await room.page.clock.runFor(50)
          return dialog.getByText("'steps'", { exact: false }).count()
        },
        { timeout: 10_000 },
      )
      .toBe(1)
  })
})
