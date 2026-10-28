import { mkdirSync, writeFileSync } from "node:fs"
import { join } from "node:path"

import type { Locator } from "playwright-core"
import { describe, expect, it } from "vitest"

import { runSubprocess } from "../fixture/subprocess.ts"
import { type ScenarioRoom, useScenarioRun } from "./scenario-run.ts"

// 歯車の設定の「ワークフロー」の面（docs/architecture/testing.md「E2E のシナリオの一覧」）。
// 場面は名指しせず（`opening` のまま）。部屋を開いたあと cwd を git のリポジトリにして `.tw/config.toml` を置き、
// 画面で並びや選択を変えて保存すると、書き込みが取り込んだワークフローの `tw config set` まで届くことを確かめる。
// 保存するまでは書かない（断りの理由が出ない）ことも見る。
// 期待値は撮らず、断りの理由が欄の下に出るかで判定する。

const run = useScenarioRun()

/** サーバが `tw` 1回を待つ上限（`TW_TIMEOUT_MS`）。 */
const TW_TIMEOUT_MS = 5000

/** 書き込み1回のサーバの最悪: `tw config set` と、読み直しの `tw` 最大2回（schema・config）が各々上限まで掛かる。 */
const WRITE_ROUND_TRIP_TIMEOUT_MS = TW_TIMEOUT_MS * 3

/** 取り込みの `tw config set` が、並びの候補に無い名前を断るときの理由の一部。 */
const REJECTED_NAME_REASON = "候補にも今の値にも無い名前"

/** 取り込みの `tw config set shell_write_guard` が、`tw`・`project` 以外の値を断るときの理由の一部。 */
const REJECTED_CHOICE_REASON = "のどちらか"

describe("ワークフローの設定", () => {
  it("外して足して保存すると、並び全体の書き込みが tw まで届く", async () => {
    const { room, dialog } = await openWorkflowFace(
      "workflow-setting-steps",
      [stepsField(["架空:甲", "架空:乙"])],
      firstStepMenu,
    )

    await dialog.getByRole("button", { name: "架空の甲 の操作" }).click()
    await dialog.getByRole("menuitem", { name: "並びから外す" }).click()
    await dialog.getByRole("button", { name: "架空の丙 を並びの最後に足す" }).click()

    await expectWrittenAfterSave(room, dialog)
  })

  // Space でページが送られないこと、つかんでいるあいだの Esc でダイアログが閉じないことは、実ブラウザの既定の動きで決まる。
  it("つかむ点で Space・↓・Space と打つと並びが変わり、Esc はつかむ前へ戻してダイアログを閉じない", async () => {
    const { room, dialog } = await openWorkflowFace(
      "workflow-setting-keyboard",
      [stepsField(["架空:甲", "架空:乙", "架空:丙"])],
      firstStepMenu,
    )
    const order = (): Promise<string[]> =>
      dialog
        .getByRole("list", { name: "スキルの並び" })
        .getByRole("listitem")
        .evaluateAll((items) =>
          items.map((item) => item.querySelector("p span")?.textContent ?? ""),
        )
    const announcement = dialog.getByRole("status")
    const scrolled = (): Promise<number> =>
      room.page.evaluate(
        () =>
          window.scrollY +
          Array.from(document.querySelectorAll("dialog *")).reduce(
            (sum, element) => sum + element.scrollTop,
            0,
          ),
      )
    const scrolledBefore = await scrolled()

    await dialog.getByRole("button", { name: "架空の甲 を動かす（↑↓ キーでも）" }).focus()
    await room.page.keyboard.press("Space")
    await room.page.keyboard.press("ArrowDown")
    await room.page.keyboard.press("Escape")

    expect(await dialog.isVisible()).toBe(true)
    expect(await order()).toEqual(["架空の甲", "架空の乙", "架空の丙"])
    expect(await announcement.textContent()).toBe("架空の甲 を 1 番目へ戻した")

    await room.page.keyboard.press("Space")
    await room.page.keyboard.press("ArrowDown")
    await room.page.keyboard.press("Space")

    expect(await order()).toEqual(["架空の乙", "架空の甲", "架空の丙"])
    expect(await announcement.textContent()).toBe("架空の甲 を 2 番目へ置いた")
    expect(
      await dialog
        .getByRole("button", { name: "架空の甲 を動かす（↑↓ キーでも）" })
        .evaluate((element) => element === document.activeElement),
    ).toBe(true)
    expect(await scrolled()).toBe(scrolledBefore)
    expect(await dialog.getByRole("menu").count()).toBe(0)

    await expectWrittenAfterSave(room, dialog)
  })

  it("選択を替えて保存すると、値そのままの書き込みが tw まで届く", async () => {
    const { room, dialog } = await openWorkflowFace(
      "workflow-setting-choice",
      [guardField()],
      (face) => face.getByRole("radiogroup", { name: "架空の判定" }),
    )

    await dialog.getByRole("radio", { name: /架空の値/u }).check()

    await expectWrittenAfterSave(room, dialog, REJECTED_CHOICE_REASON)
  })
})

/**
 * 読み取りの応答だけを架空のスキルの並びの面に差し替える。
 * 書き込みは本物の `tw config set` まで届き、候補に無い名前として断られる理由が欄の下に出ることで、往復を確かめる。
 */
async function openWorkflowFace(
  scenario: string,
  fields: readonly object[],
  ready: (dialog: Locator) => Locator,
): Promise<{ readonly room: ScenarioRoom; readonly dialog: Locator }> {
  const room = await run.open({ scenario, scene: "none", viewport: "wide", domRoots: [] })
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
          fields,
        },
      }),
    }),
  )

  await room.page.locator('button[aria-label="設定"][aria-haspopup="dialog"]').click()
  const dialog = room.page.getByRole("dialog", { name: "設定" })
  await room.revealAfterResponse(ready(dialog), {
    response: "workflowSetting/read",
    baseline: {
      kind: "after-act",
      act: () => dialog.getByRole("button", { name: "ワークフロー" }).click(),
    },
  })
  return { room, dialog }
}

function stepsField(current: readonly string[]): object {
  return {
    kind: "steps",
    key: "steps",
    label: "スキルの並び",
    description: "架空の説明",
    values: [
      { value: "架空:甲", label: "甲", title: "架空の甲", description: "" },
      { value: "架空:乙", label: "乙", title: "架空の乙", description: "" },
      { value: "架空:丙", label: "丙", title: "架空の丙", description: "" },
    ],
    current,
  }
}

/** 取り込みの schema が返す `shell_write_guard` と同じキーで、候補に `tw` の断る値（`架空`）を足した選択の欄。 */
function guardField(): object {
  return {
    kind: "choice",
    key: "shell_write_guard",
    label: "架空の判定",
    description: "架空の説明",
    values: [
      { value: "tw", label: "tw が止める", description: "" },
      { value: "架空", label: "架空の値", description: "" },
    ],
    current: "tw",
  }
}

function firstStepMenu(dialog: Locator): Locator {
  return dialog.getByRole("button", { name: "架空の甲 の操作" })
}

async function expectWrittenAfterSave(
  room: ScenarioRoom,
  dialog: Locator,
  reason: string = REJECTED_NAME_REASON,
): Promise<void> {
  await room.page.clock.runFor(50)
  expect(await dialog.getByText(reason, { exact: false }).count()).toBe(0)

  await dialog.getByRole("button", { name: "保存" }).click()

  await expect
    .poll(
      async () => {
        await room.page.clock.runFor(50)
        return dialog.getByText(reason, { exact: false }).count()
      },
      { timeout: WRITE_ROUND_TRIP_TIMEOUT_MS },
    )
    .toBe(1)
}
