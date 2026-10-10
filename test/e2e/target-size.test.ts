import { mkdirSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"

import { describe, expect, it } from "vitest"

import { git, initGitRepository } from "../fixture/git-repository.ts"
import { expectReadable } from "./readability-scan.ts"
import { useScenarioRun, VIEWPORTS } from "./scenario-run.ts"
import { openTaskListRoomWithRunningTask, READY_TASK_ID } from "./task-room.ts"

// 会話の画面の押せるものが 24x24 以上で名前を持ち、字が 12px 以上・4.5:1 以上であること
// （docs/architecture/testing.md「E2E のシナリオの一覧」）。期待値は撮らず、割れたものの名前と寸法を差分に出す。

const run = useScenarioRun()

describe("会話の画面の押す的と字", () => {
  it("迎える画面とサイドバー、サイドバーのタスクののぞき窓の押せるもの・字が下限を割らない（medium と large）", async () => {
    const room = await openTaskListRoomWithRunningTask(run, "target-size-welcome", [], "medium")
    await room.page.getByRole("button", { name: "サイドバー", exact: true }).click()
    await room.page.locator('[data-region="sidebar"]').waitFor()
    await expectReadable(room.page)

    await room.page.locator(`#task-row-${READY_TASK_ID}`).click()
    await room.page.getByRole("button", { name: "これを始める →" }).waitFor()
    await expectReadable(room.page)

    await room.resize(VIEWPORTS.large)
    await room.page.getByRole("button", { name: "これを始める →" }).waitFor()
    await expectReadable(room.page)
  })

  it("お伺いで選択肢を選んだあとの押せるもの・字が下限を割らない（medium と large）", async () => {
    const room = await run.open({
      scenario: "target-size-inquiry",
      scene: "question-multi",
      viewport: "medium",
      domRoots: [],
    })
    await room.waitForEvent("turn-finished")
    await room.page.getByRole("checkbox").first().check()
    const answer = room.page.getByRole("button", { name: /これで答える/ })
    await expect.poll(() => answer.getAttribute("aria-disabled")).not.toBe("true")
    await expectReadable(room.page)

    await room.resize(VIEWPORTS.large)
    await expect.poll(() => answer.getAttribute("aria-disabled")).not.toBe("true")
    await expectReadable(room.page)
  })

  it("過去のやり取りを見るときの知らせの行と「最新」の札が下限を割らない", async () => {
    const room = await run.open({
      scenario: "target-size-head-notice",
      scene: "turn-rail-notice",
      viewport: "large",
      domRoots: [],
    })
    await room.waitForEvent("pending-changed")
    await room.page.getByRole("button", { name: "完了: 枠の色を揃えたい（架空の依頼）" }).click()
    await room.page.getByRole("button", { name: "お伺いが届いた" }).waitFor()
    await expectReadable(room.page)
  })

  it.each([
    ["work-plan", "work-plan-quick"],
    ["verdict", "report-task-verdict"],
  ] as const)("レポートの段取りと検証の字が下限を割らない（%s）", async (name, scene) => {
    const room = await run.open({
      scenario: `target-size-report-${name}`,
      scene,
      viewport: "large",
      domRoots: [],
    })
    await room.waitForEvent("turn-finished")
    await expectReadable(room.page)
  })
})

describe("レポートの押せるパスの押す的と字", () => {
  const LONG_PATH =
    "src/browser/components/page/conversation/components/main-view/markdown/report-notation.module.css"

  it("記法の一覧の字と、文の中で押せる部品になった git 管理下の長いパスが下限を割らない", async () => {
    const room = await run.open({
      scenario: "target-size-report-file-link",
      scene: "notation",
      viewport: "large",
      domRoots: [],
    })
    await room.waitForEvent("turn-finished")

    await initGitRepository(room.cwd)
    mkdirSync(join(room.cwd, dirname(LONG_PATH)), { recursive: true })
    writeFileSync(join(room.cwd, LONG_PATH), "")
    await git(room.cwd, "add", LONG_PATH)
    await git(room.cwd, "commit", "--quiet", "-m", "架空のファイル")
    const links = room.page.locator('[data-region="main"] span[role="button"]')
    // 時計が止まっているので、一覧の応答を React Query が配るのに要るタイマーは応答のあとで進める。
    await room.revealAfterResponse(links.nth(2), {
      response: "listFiles",
      baseline: {
        kind: "after-act",
        act: () => room.page.reload({ waitUntil: "domcontentloaded" }).then(() => undefined),
      },
    })
    expect(await links.count()).toBe(3)
    await expectReadable(room.page)
  })
})
