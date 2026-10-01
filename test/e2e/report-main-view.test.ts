import { describe, expect, it } from "vitest"

import { useScenarioRun } from "./scenario-run.ts"

// report → メインビュー（記法・差し戻し・整え。docs/architecture/testing.md「E2E のシナリオの一覧」）。
// `report` ツールの呼び出しがメインビューの Markdown へどう出るかを、疑似セッションの5つの場面で
// 確かめる（`report-defaults` は既定値のある欄を省いたレポート、`report-compare` は見比べの塊、`report-dimension` は寸法図の塊、`report-matrix` は対応表の塊、`report-stats` は数の要約の全体の数）: `notation`（記法の一覧）、`report-rejected`（差し戻されたレポートは描かれず、
// 直したレポートだけが残る）、`report-tidied`（整形で落ちる行は描かれず、残りはそのまま出る）、
// `report-blocks`（候補の比較と触ったファイルの一覧の塊）、`report-chart`（棒・折れ線・円の
// グラフの塊）。

const run = useScenarioRun()

/** 撮るときの経過（凍らせた瞬間から）。「何秒前」の類いをこの値で揃える。 */
const ELAPSED_MS = 60_000

describe("report → メインビュー", () => {
  it("記法の一覧がメインビューに描かれる", async () => {
    const room = await run.open({
      scenario: "report-notation",
      scene: "notation",
      viewport: "wide",
      domRoots: ["main"],
    })

    await room.waitForEvent("turn-finished")
    await room.settleAndMatch(ELAPSED_MS)
  })

  it("差し戻されたレポートは描かれず、直したレポートだけが残る", async () => {
    const room = await run.open({
      scenario: "report-rejected",
      scene: "report-rejected-quick",
      viewport: "wide",
      domRoots: ["main"],
    })

    await room.waitForEvent("turn-finished")
    await room.settleAndMatch(ELAPSED_MS)
  })

  it("整形で落ちる行は描かれず、残りはそのまま出る", async () => {
    const room = await run.open({
      scenario: "report-tidied",
      scene: "report-tidied",
      viewport: "wide",
      domRoots: ["main"],
    })

    await room.waitForEvent("turn-finished")
    await room.settleAndMatch(ELAPSED_MS)
  })

  it("候補の比較は書いた順のカードに判定の語が付き、触ったファイルは1行ずつ種別の語とパスで出る", async () => {
    const room = await run.open({
      scenario: "report-blocks",
      scene: "report-blocks",
      viewport: "wide",
      domRoots: ["main"],
    })

    await room.waitForEvent("turn-finished")
    await room.settleAndMatch(ELAPSED_MS)
  })

  it("chart の塊が種類ごとにグラフとして描かれる", async () => {
    const room = await run.open({
      scenario: "report-chart",
      scene: "report-chart",
      viewport: "wide",
      domRoots: ["main"],
    })

    await room.waitForEvent("turn-finished")
    await room.settleAndMatch(ELAPSED_MS)
  })

  it("stats の全体の数が文字と割合の帯で描かれ、読めない場合は文字だけになる", async () => {
    const room = await run.open({
      scenario: "report-stats",
      scene: "report-stats",
      viewport: "wide",
      domRoots: ["main"],
    })

    await room.waitForEvent("turn-finished")
    await room.settleAndMatch(ELAPSED_MS)
  })

  it("既定値のある欄を省いたレポートも描かれる", async () => {
    const room = await run.open({
      scenario: "report-defaults",
      scene: "report-defaults",
      viewport: "wide",
      domRoots: ["main"],
    })

    await room.waitForEvent("turn-finished")
    await room.settleAndMatch(ELAPSED_MS)
  })

  it("compare の塊が2つの側の札として描かれる", async () => {
    const room = await run.open({
      scenario: "report-compare",
      scene: "report-compare",
      viewport: "wide",
      domRoots: ["main"],
    })

    await room.waitForEvent("turn-finished")
    await room.settleAndMatch(ELAPSED_MS)
  })

  it("dimension の塊が領域の箱と余白の帯・寸法の値として描かれる", async () => {
    const room = await run.open({
      scenario: "report-dimension",
      scene: "report-dimension",
      viewport: "wide",
      domRoots: ["main"],
    })

    await room.waitForEvent("turn-finished")
    await room.settleAndMatch(ELAPSED_MS)
  })

  it("matrix の塊が印と aria-label と凡例つきの格子として描かれる", async () => {
    const room = await run.open({
      scenario: "report-matrix",
      scene: "report-matrix",
      viewport: "wide",
      domRoots: ["main"],
    })

    await room.waitForEvent("turn-finished")
    await room.settleAndMatch(ELAPSED_MS)
  })

  it("目次は見出しの一覧が最初から列に出ていて、一番下の行を押すとその行が現在の印を持つ", async () => {
    const room = await run.open({
      scenario: "report-outline",
      scene: "long-report-quick",
      viewport: "wide",
      domRoots: ["main"],
    })

    await room.waitForEvent("turn-finished")
    const rows = room.page.getByRole("navigation", { name: "目次" }).getByRole("button")
    await rows.last().click()
    await room.page
      .locator('nav[aria-label="目次"] button:last-child[aria-current="location"]')
      .waitFor()
    await room.settleAndMatch(ELAPSED_MS)
  })

  it("目次と本文の境界をドラッグすると目次の幅が変わる", async () => {
    const room = await run.open({
      scenario: "report-outline-resize",
      scene: "long-report-quick",
      viewport: "wide",
      domRoots: ["main"],
    })

    await room.waitForEvent("turn-finished")
    const resizer = room.page.getByRole("separator", { name: "目次と本文の境界" })
    const box = await resizer.boundingBox()
    if (box === null) {
      throw new Error("仕切りの位置が取れない")
    }
    const rail = room.page.locator('nav[aria-label="目次"] >> xpath=..')
    const widthBefore = await rail.evaluate((element) => element.getBoundingClientRect().width)

    // 列は本文と同じ高さいっぱいに伸びる（本文が長いほど縦に長い）ので、仕切りの縦の中点ではなく
    // 上端寄りの、カードの見えている範囲に収まる点を掴む。
    const startX = box.x + box.width / 2
    const startY = box.y + 20
    await room.page.mouse.move(startX, startY)
    await room.page.mouse.down()
    await room.page.mouse.move(startX + 80, startY)
    await room.page.mouse.up()

    // `container-type` を持つ器の中の grid の列幅は、ドラッグの直後にそのまま測ると
    // まだ古い幅のまま（次の描画で追いつく）。`waitForFunction` で追いつくのを待つ。
    await room.page.waitForFunction(
      (minWidth) => {
        const nav = document.querySelector('nav[aria-label="目次"]')
        const railElement = nav?.parentElement
        return (
          railElement !== null &&
          railElement !== undefined &&
          railElement.getBoundingClientRect().width > minWidth
        )
      },
      widthBefore + 60,
      { polling: 50 },
    )
    const widthAfter = await rail.evaluate((element) => element.getBoundingClientRect().width)
    expect(widthAfter).toBeGreaterThan(widthBefore + 60)

    await room.settleAndMatch(ELAPSED_MS)
  })

  it("目次を畳む／開くボタンで一覧の出し入れができる", async () => {
    const room = await run.open({
      scenario: "report-outline-collapsed",
      scene: "long-report-quick",
      viewport: "wide",
      domRoots: ["main"],
    })

    await room.waitForEvent("turn-finished")
    const content = room.page.locator('nav[aria-label="目次"] >> xpath=../../*[last()]')
    const xBefore = await content.evaluate((element) => element.getBoundingClientRect().x)

    await room.page.getByRole("button", { name: "目次を畳む" }).click()
    await room.page.getByRole("button", { name: "目次を開く" }).waitFor()

    const xAfter = await content.evaluate((element) => element.getBoundingClientRect().x)
    expect(xAfter).toBeLessThan(xBefore)

    await room.settleAndMatch(ELAPSED_MS)
  })

  it("狭い画面では目次の列が描かれない", async () => {
    const room = await run.open({
      scenario: "report-outline-narrow",
      scene: "long-report-quick",
      viewport: "narrow",
      domRoots: ["main"],
    })

    await room.waitForEvent("turn-finished")
    await room.settleAndMatch(ELAPSED_MS)
  })
})
