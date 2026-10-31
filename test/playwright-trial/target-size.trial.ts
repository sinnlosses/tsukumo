import { mkdirSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"

import { expectReadable } from "../e2e/readability-scan.ts"
import {
  openTaskBoardRoomWithDrafts,
  openTaskListRoomWithRunningTask,
  READY_TASK_ID,
} from "../e2e/task-room.ts"
import { git, initGitRepository } from "../fixture/git-repository.ts"
import { expect, test, VIEWPORTS } from "./room-fixture.ts"

// openRoom が context の trace を自分で始めるので、設定側の trace は切る
test.use({ trace: "off" })

test("迎える画面とサイドバー、サイドバーのタスクののぞき窓の押せるもの・字が下限を割らない（medium と large）", async ({
  run,
}) => {
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

test("お伺いで選択肢を選んだあとの押せるもの・字が下限を割らない（medium と large）", async ({
  run,
}) => {
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

test("過去のやり取りを見るときの知らせの行と「最新」の札が下限を割らない", async ({ run }) => {
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

for (const [name, scene] of [
  ["work-plan", "work-plan-quick"],
  ["verdict", "report-task-verdict"],
] as const) {
  test(`レポートのワークプランと検証の字が下限を割らない（${name}）`, async ({ run }) => {
    const room = await run.open({
      scenario: `target-size-report-${name}`,
      scene,
      viewport: "large",
      domRoots: [],
    })
    await room.waitForEvent("turn-finished")
    await expectReadable(room.page)
  })
}

test("行の3択・却下の理由の欄・下端の帯の押せるもの・字が下限を割らない", async ({ run }) => {
  const room = await openTaskBoardRoomWithDrafts(run, "target-size-draft-sort", [])
  const board = room.page.getByRole("dialog", { name: "タスク" })
  await board.getByRole("button", { name: "ドラフト 2", exact: true }).click()
  const groups = board.getByRole("radiogroup")
  await groups.nth(0).getByRole("radio", { name: "却下" }).click()
  await room.page.getByText("却下の理由:").waitFor()
  await groups.nth(1).getByRole("radio", { name: "計画" }).click()
  await room.page.getByRole("button", { name: "仕分けを戻す" }).waitFor()
  await room.page.getByRole("button", { name: /を頼む$/ }).waitFor()
  await expectReadable(room.page)
})

const LONG_PATH =
  "src/browser/components/page/conversation/components/main-view/markdown/report-notation.module.css"

test("記法の一覧の字と、文の中で押せる部品になった git 管理下の長いパスが下限を割らない", async ({
  run,
}) => {
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
