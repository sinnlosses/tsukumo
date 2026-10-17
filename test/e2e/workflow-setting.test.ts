import { mkdirSync, writeFileSync } from "node:fs"
import { join } from "node:path"

import { describe, expect, it } from "vitest"

import { TW_TIMEOUT_MS } from "../../src/server/workflow-setting/adapter/tw-config.ts"
import { runSubprocess } from "../fixture/subprocess.ts"
import { useScenarioRun } from "./scenario-run.ts"

// 歯車の設定の「ワークフロー」の面（docs/architecture/testing.md「E2E のシナリオの一覧」）。
// 場面は名指しせず（`opening` のまま）。部屋を開いたあと cwd を git のリポジトリにして `.tw/config.toml` を置き、
// 画面で「…」から外して札から足し、保存すると、並び全体の書き込みが取り込んだワークフローの `tw config set` まで届くことを確かめる。
// 保存するまでは書かない（断りの理由が出ない）ことも見る。
// 期待値は撮らず、断りの理由が欄の下に出るかで判定する。

const run = useScenarioRun()

/** 書き込み1回のサーバの最悪: `tw config set` と、読み直しの `tw` 最大2回（schema・config）が各々上限まで掛かる。 */
const WRITE_ROUND_TRIP_TIMEOUT_MS = TW_TIMEOUT_MS * 3

describe("ワークフローの設定", () => {
  // 取り込みの `tw` が schema 1 のままのあいだは、読み取りの応答だけを schema 2 の面に差し替える。
  // 書き込みは本物の `tw config set` まで届き、知らないキーとして断られる理由が欄の下に出ることで、往復を確かめる。
  it("外して足して保存すると、並び全体の書き込みが tw まで届く", async () => {
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
            fields: [
              {
                kind: "steps",
                key: "steps",
                label: "スキルの並び",
                description: "架空の説明",
                values: [
                  { value: "架空:甲", label: "甲", title: "架空の甲", description: "" },
                  { value: "架空:乙", label: "乙", title: "架空の乙", description: "" },
                  { value: "架空:丙", label: "丙", title: "架空の丙", description: "" },
                ],
                current: ["架空:甲", "架空:乙"],
              },
            ],
          },
        }),
      }),
    )

    await room.page.locator('button[aria-label="設定"][aria-haspopup="dialog"]').click()
    const dialog = room.page.getByRole("dialog", { name: "設定" })
    const menuTrigger = dialog.getByRole("button", { name: "架空の甲 の操作" })
    await room.revealAfterResponse(menuTrigger, {
      response: "workflowSetting/read",
      baseline: {
        kind: "after-act",
        act: () => dialog.getByRole("button", { name: "ワークフロー" }).click(),
      },
    })

    await menuTrigger.click()
    await dialog.getByRole("menuitem", { name: "並びから外す" }).click()
    await dialog.getByRole("button", { name: "架空の丙 を並びの最後に足す" }).click()
    await room.page.clock.runFor(50)
    expect(await dialog.getByText("'steps'", { exact: false }).count()).toBe(0)

    await dialog.getByRole("button", { name: "保存" }).click()

    await expect
      .poll(
        async () => {
          await room.page.clock.runFor(50)
          return dialog.getByText("'steps'", { exact: false }).count()
        },
        { timeout: WRITE_ROUND_TRIP_TIMEOUT_MS },
      )
      .toBe(1)
  })
})
