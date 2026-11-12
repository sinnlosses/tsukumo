import { expect, type ScenarioRun, test } from "./room-fixture.ts"

async function openAchievementSheet(
  run: ScenarioRun,
  scenario: string,
  viewport: "wide" | "narrow",
) {
  const room = await run.open({ scenario, scene: "none", viewport, domRoots: ["page"] })
  const url = new URL(room.page.url())
  url.searchParams.set("shell", "stage")
  url.hash = "#achievement"
  await room.page.goto(url.toString())
  await room.page.getByRole("region", { name: "灯りの暦" }).waitFor()
  return room
}

test.describe("成果の紙", () => {
  test("広い幅では暦が左、日記の区画が右に並ぶ", async ({ run }) => {
    const room = await openAchievementSheet(run, "achievement-sheet-wide", "wide")
    const calendar = await room.page.getByRole("region", { name: "灯りの暦" }).boundingBox()
    const diary = await room.page.getByRole("region", { name: "この日の日記" }).boundingBox()
    expect(calendar).not.toBeNull()
    expect(diary).not.toBeNull()
    expect((calendar?.x ?? 0) + (calendar?.width ?? 0)).toBeLessThanOrEqual(diary?.x ?? 0)
  })

  test("狭い幅では縦1列に積む", async ({ run }) => {
    const room = await openAchievementSheet(run, "achievement-sheet-narrow", "narrow")
    const calendar = await room.page.getByRole("region", { name: "灯りの暦" }).boundingBox()
    const diary = await room.page.getByRole("region", { name: "この日の日記" }).boundingBox()
    expect((calendar?.y ?? 0) + (calendar?.height ?? 0)).toBeLessThanOrEqual(diary?.y ?? 0)
  })
})
