import type { Locator, Page } from "playwright-core"

import { expect, test } from "./room-fixture.ts"
import type { ScenarioOptions, ScenarioRoom } from "./scenario-open.ts"
import {
  expectedStageLookNames,
  matchStageLook,
  STAGE_LOOK_PREFIX,
  stillShot,
} from "./stage-look-compare.ts"
import { writeWelcomeTasks } from "./task-room.ts"

// 器の見た目の画の回帰（docs/architecture/testing.md「E2E のシナリオの一覧」）。
// 6つの場面を1回ずつ開き、3つの幅へビューポートを変えて撮り、期待値の画と画素で比べる。
// 時刻・経過の数・今日の灯り・部屋の名前（一時のディレクトリの名前が出る）は覆って撮る。

/** 撮る幅。狭い画面・広い画面・フルHD。 */
const WIDTHS = [
  { label: "720", viewport: { width: 720, height: 900 } },
  { label: "1400", viewport: { width: 1400, height: 900 } },
  { label: "1920", viewport: { width: 1920, height: 1080 } },
] as const

type LookScene = {
  readonly open: Omit<ScenarioOptions, "scenario" | "viewport" | "domRoots">
  /** 開いたあと、撮る画の状態まで進める。 */
  readonly prepare: (room: ScenarioRoom) => Promise<void>
}

const RESUME_CARD = "架空の成果の画面に振り返りの口を置きたい"

/** 離れていた時間。`work-plan-paper` の「23 分離れて戻ると」と同じ。 */
const AWAY_MS = 23 * 60 * 1000

const SCENES = {
  "welcome-recommendation": {
    open: { scene: "welcome-recommendation" },
    prepare: async (room) => {
      await showWelcome(room)
    },
  },
  "welcome-typed": {
    open: { scene: "welcome-recommendation" },
    prepare: async (room) => {
      await showWelcome(room)
      await room.page
        .locator('[data-region="dock"] textarea')
        .fill("見出しの付け方を相談したい（架空の依頼）")
    },
  },
  "work-strip-running": {
    // 4つ目の手順（長い Bash）が走り出した手で止める。
    open: { scene: "work-strip-running", sceneUntil: 10 },
    prepare: async (room) => {
      await room.waitForEvent("tool-started", 4)
    },
  },
  "question-multi": {
    open: { scene: "question-multi" },
    prepare: async (room) => {
      await room.waitForPending("fake-ask-2")
      await room.waitForEvent("utterance")
    },
  },
  "report-tool": {
    open: { scene: "report-tool" },
    prepare: async (room) => {
      await room.waitForEvent("turn-finished")
    },
  },
  "work-plan-away": {
    open: { scene: "work-plan-away" },
    prepare: async (room) => {
      await room.waitForEvent("work-plan", 2)
      const plan = room.page.getByRole("region", { name: "ワークプラン" })
      await expect(plan.getByRole("img", { name: "4段のうち2段目" })).toBeVisible()
      await setPageHidden(room.page, true)
      await room.waitForEvent("pending-changed")
      await room.page.clock.runFor(AWAY_MS)
      await setPageHidden(room.page, false)
      await expect(plan.getByRole("region", { name: "離れていたあいだのまとめ" })).toBeVisible()
    },
  },
} as const satisfies Record<string, LookScene>

const EXPECTED_NAMES = Object.keys(SCENES).flatMap((scene) =>
  WIDTHS.map(({ label }) => lookName(scene, label)),
)

test.describe("器の見た目の画", () => {
  for (const [scene, look] of Object.entries(SCENES)) {
    test(`${scene} を 720・1400・1920 の幅で撮った画が期待値と画素で揃う`, async ({ run }) => {
      const room = await run.open({
        ...look.open,
        scenario: `${STAGE_LOOK_PREFIX}${scene}`,
        viewport: "wide",
        domRoots: [],
      })
      await look.prepare(room)
      for (const { label, viewport } of WIDTHS) {
        await room.resize(viewport)
        matchStageLook(lookName(scene, label), await stillShot(room.page, masksOf(room.page)))
      }
    })
  }

  test("期待値の画は場面と幅の組の分だけあり、使われない画が残っていない", () => {
    expect(expectedStageLookNames().toSorted()).toEqual(EXPECTED_NAMES.toSorted())
  })
})

function lookName(scene: string, width: string): string {
  return `${STAGE_LOOK_PREFIX}${scene}-${width}.png`
}

/** 走らせるたびに変わりうる所。部屋の名前は一時のディレクトリの名前で、走らせるたびに変わる。 */
function masksOf(page: Page): readonly Locator[] {
  return [
    page.locator("time"),
    page.locator("[data-tick]"),
    page.locator('[data-slot="today"]'),
    page.locator('[data-region="sidebar"] button[aria-haspopup="dialog"]').first(),
  ]
}

async function showWelcome(room: ScenarioRoom): Promise<void> {
  await writeWelcomeTasks(room)
  await room.waitForEvent("sessions-changed")
  const resume = room.page
    .locator('[data-region="paper"]')
    .getByRole("button", { name: new RegExp(RESUME_CARD) })
  await room.revealAfterResponse(resume, {
    response: "sessionDigest",
    baseline: { kind: "all" },
  })
}

/** ページの `document.hidden` を上書きして `visibilitychange` を起こす（タブを裏に回した・戻したの模擬）。 */
async function setPageHidden(page: Page, hidden: boolean): Promise<void> {
  await page.evaluate((value) => {
    Object.defineProperty(document, "hidden", { configurable: true, get: () => value })
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      get: () => (value ? "hidden" : "visible"),
    })
    document.dispatchEvent(new Event("visibilitychange"))
  }, hidden)
}
