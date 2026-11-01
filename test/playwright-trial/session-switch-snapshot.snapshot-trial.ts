import { readFileSync } from "node:fs"
import path from "node:path"

import { OUTPUT_ROOT } from "../e2e/artifact.ts"
import { expect, test } from "../e2e/room-fixture.ts"

// settleAndMatchPickedWithMessages が書いた成果物を読み、メッセージの列を toMatchSnapshot でも比べる。
// openRoom が context の trace を自分で始めるので、設定側の trace は切る
test.use({ trace: "off" })

test("session-switch-enter のメッセージの列が、本体の期待値と toMatchSnapshot で一致する", async ({
  run,
}) => {
  const room = await run.open({
    scenario: "session-switch-enter",
    scene: "session-list",
    viewport: "wide",
    domRoots: ["screen-nav", "session-switcher"],
  })
  await room.waitForEvent("sessions-changed")
  await room.page.getByRole("button", { name: /セッション FA。押すと/u }).click()
  const search = room.page.getByRole("combobox", { name: "セッションを探す" })
  await search.waitFor()
  await search.press("ArrowDown")
  await search.press("Enter")
  await room.waitForEvent("sessions-changed", 2)
  await room.settleAndMatchPickedWithMessages(60_000)

  const written = readFileSync(
    path.join(OUTPUT_ROOT, "session-switch-enter", "session-switch-enter.messages.json"),
    "utf8",
  )
  expect(written).toMatchSnapshot("session-switch-enter.messages.json")
})
