import type { Locator, Page } from "@playwright/test"

import { fictionalPng } from "../../scripts/shared/fictional-png.ts"
import { expect, test, VIEWPORTS } from "./room-fixture.ts"

// お伺い（許可要求と質問。docs/architecture/testing.md「E2E のシナリオの一覧」）。
// 許可は場面 `permission`（本文が長くカードがビューポートの外に出る場合は `inquiry-below-body`）、質問は `question-pair`（単一選択が1問ずつ）・
// `question-long`（長いラベルと長い説明）・`question-preview`（選択肢ごとの比較）・
// `question-preview-image`（preview に書いた手元の画像と、描かない画像）・
// `question-brief`（添え書き付き。広いビューポートの2列から、ビューポートを狭めてカードの1列へ）。
// どの場面も答え待ちを出したまま、答えると次の `pending-changed` が流れる。

/** 撮るときの経過（凍らせた瞬間から）。「何秒前」の類いをこの値で揃える。 */
const ELAPSED_MS = 60_000

test.describe("お伺い", () => {
  test("許可は、カードを選んで「これで答える」を押すと答えが流れ、札が消える（マウス）", async ({
    run,
  }) => {
    const room = await run.open({
      scenario: "inquiry-permission-mouse",
      scene: "permission",
      viewport: "wide",
      domRoots: ["main", "dispatch"],
    })
    const inquiry = inquiryOf(room.page)

    // 場面の手が流れ終わってから押す（押して流れる `pending-changed` を場面の手と競わせない）。
    // ターンの終わりのあとに駆動が流す `setting-confirmed` まで待つ（答えの応答と届く順を競わせない）。
    await room.waitForEvent("turn-finished")
    await room.waitForEvent("setting-confirmed")
    await inquiry.getByRole("radio", { name: /許可/ }).click()
    await inquiry.getByRole("button", { name: /これで答える/ }).click()
    await room.waitForEvent("pending-changed", 2)
    await expect.poll(() => inquiry.count()).toBe(0)
    await room.settleAndMatchPickedWithMessages(ELAPSED_MS)
  })

  test("カードは本文の末尾に出て、ビューポートの外のあいだ下端の「お伺い ↓」を押すとカードがビューポートに入り、ボタンが消える", async ({
    run,
  }) => {
    const room = await run.open({
      scenario: "inquiry-below-body",
      scene: "inquiry-below-body",
      viewport: "wide",
      domRoots: ["main"],
    })
    const main = room.page.locator('[data-region="main"]')
    const inquiry = inquiryOf(room.page)
    const jump = room.page.getByRole("button", { name: "お伺い ↓" })

    await room.waitForPending("fake-below-body-1")
    // 届くと札まで送られ、札は本文（最後の中間レポート）より下にある。
    await expect.poll(() => insideOf(inquiry, main)).toBe(true)
    const [lastReport, card] = await Promise.all([
      main.getByText("八つ目の段で架空の仕上げを終えた").boundingBox(),
      inquiry.boundingBox(),
    ])
    expect(lastReport !== null && card !== null && card.y > lastReport.y).toBe(true)
    expect(await jump.count()).toBe(0)

    await main.evaluate((element) => {
      element.scrollTop = 0
    })
    await expect.poll(() => jump.count()).toBe(1)
    expect(await insideOf(inquiry, main)).toBe(false)

    await jump.click()
    await expect.poll(() => insideOf(inquiry, main)).toBe(true)
    await expect.poll(() => jump.count()).toBe(0)
  })

  test("質問は、カードを選んで「次へ」「これで答える」で1問ずつ答える（マウス）", async ({
    run,
  }) => {
    const room = await run.open({
      scenario: "inquiry-question-mouse",
      scene: "question-pair",
      viewport: "wide",
      domRoots: ["main"],
    })
    const inquiry = inquiryOf(room.page)

    await inquiry.getByText("道具B（架空）").click()
    await inquiry.getByRole("button", { name: /次へ/ }).click()
    await expect.poll(() => inquiry.textContent()).toContain("2 / 2")
    await inquiry.getByText("土台（架空）").click()
    await inquiry.getByRole("button", { name: /これで答える/ }).click()

    await room.waitForEvent("question-answered")
    await expect.poll(() => inquiry.count()).toBe(0)
  })

  test("質問は、「任せる」で1問ずつ任せて答えられる（マウス）", async ({ run }) => {
    const room = await run.open({
      scenario: "inquiry-question-entrust",
      scene: "question-pair",
      viewport: "wide",
      domRoots: ["main"],
    })
    const inquiry = inquiryOf(room.page)

    await inquiry.getByRole("button", { name: "任せる" }).click()
    await expect.poll(() => inquiry.textContent()).toContain("2 / 2")
    await inquiry.getByRole("button", { name: "任せる" }).click()

    await room.waitForEvent("question-answered")
    await expect.poll(() => inquiry.count()).toBe(0)
  })

  for (const [scenario, scene] of [
    ["inquiry-question-long-medium", "question-long"],
    ["inquiry-question-preview-medium", "question-preview"],
  ] as const) {
    test(`${scenario}: 札の「次へ」「これで答える」はメインビューの中にあり、転がさずに押せる`, async ({
      run,
    }) => {
      const room = await run.open({ scenario, scene, viewport: "medium", domRoots: ["main"] })
      const main = room.page.locator('[data-region="main"]')
      const answer = inquiryOf(room.page).getByRole("button", { name: /次へ|これで答える/ })

      await expect.poll(() => insideOf(answer, main)).toBe(true)
      const hit = await answer.evaluate((element) => {
        const rect = element.getBoundingClientRect()
        const found = document.elementFromPoint(
          rect.left + rect.width / 2,
          rect.top + rect.height / 2,
        )
        return found !== null && element.contains(found)
      })
      expect(hit).toBe(true)
    })
  }

  test("添え書き付きの質問は、広いビューポートで左に選択肢・右に詳細の2列になり、選び替えで詳細が替わり、Enter で次へ進む", async ({
    run,
  }) => {
    const room = await run.open({
      scenario: "inquiry-question-brief-wide",
      scene: "question-brief",
      viewport: "wide",
      domRoots: ["main"],
    })
    const inquiry = inquiryOf(room.page)
    const detail = inquiry.getByRole("group", { name: /の詳細$/ })

    // 触る前は詳細を出さず、比べる表も出さず、案内の1行だけを出す。
    await expect(inquiry.getByText("選択肢を押すと詳細が出ます")).toBeVisible()
    expect(await inquiry.locator("details table").count()).toBe(0)
    expect(await detail.count()).toBe(0)
    expect(await inquiry.getByText("⚠ 戻せない").count()).toBe(1)

    const tops = await Promise.all(
      ["聞く理由", "事実", "おすすめの理由"].map(async (label) => {
        const box = await inquiry.getByText(label, { exact: true }).boundingBox()
        return box === null ? -1 : box.y
      }),
    )
    expect(tops.every((top) => top >= 0)).toBe(true)
    expect(tops).toEqual(tops.toSorted((a, b) => a - b))
    const firstOption = await inquiry.getByRole("radio", { name: /A に置く/ }).boundingBox()
    expect(firstOption !== null && firstOption.y > (tops[2] ?? Infinity)).toBe(true)
    for (const mark of ["確かめた", "写した", "確度 高"]) {
      await expect(inquiry.getByText(mark, { exact: true })).toBeVisible()
    }

    await inquiry.getByRole("radio", { name: /A に置く/ }).click()
    await expect.poll(() => detail.count()).toBe(1)
    const [options, panel] = await Promise.all([
      inquiry.getByRole("radio", { name: /A に置く/ }).boundingBox(),
      detail.boundingBox(),
    ])
    expect(options !== null && panel !== null && panel.x > options.x + options.width).toBe(true)
    // 詳細が出て札が伸びても、札は見える範囲に収まり、「次へ」は転がさずに押せる。
    const main = room.page.locator('[data-region="main"]')
    await expect.poll(() => insideOf(inquiry, main)).toBe(true)
    await expect
      .poll(() => insideOf(inquiry.getByRole("button", { name: /次へ/ }), main))
      .toBe(true)

    expect(await inquiry.locator("details table").count()).toBe(0)
    await expect.poll(() => detail.getAttribute("aria-label")).toBe("A に置く の詳細")
    // 図も preview も無い選択肢には詳細の欄が無く、説明は選択肢の行に出ている。
    await inquiry.getByRole("radio", { name: /C に移す/ }).click()
    await expect.poll(() => detail.count()).toBe(0)
    await expect(inquiry.getByText("架空の説明C")).toBeVisible()
    await inquiry.getByRole("radio", { name: /A に置く/ }).click()

    await room.resize(VIEWPORTS.compact)
    await expect.poll(() => detail.count()).toBe(1)
    const [last, stackedPanel] = await Promise.all([
      inquiry.getByRole("radio", { name: /C に移す/ }).boundingBox(),
      detail.boundingBox(),
    ])
    expect(last !== null && stackedPanel !== null && stackedPanel.y >= last.y + last.height).toBe(
      true,
    )
    const overflow = await inquiry.evaluate((element) => element.scrollWidth - element.clientWidth)
    expect(overflow).toBeLessThanOrEqual(0)

    await room.page.keyboard.press("Enter")
    await expect.poll(() => inquiry.textContent()).toContain("2 / 2")
  })

  test("単一選択で選んだあとに入力欄へ字を書くと、選択が外れて選択肢が薄くなり、字を消すと薄いのは戻って選択は戻らない（広げた板の中も同じ）", async ({
    run,
  }) => {
    const room = await run.open({
      scenario: "inquiry-question-brief-writing",
      scene: "question-brief",
      viewport: "wide",
      domRoots: ["main"],
    })
    const inquiry = inquiryOf(room.page)
    const answer = room.page.getByPlaceholder("選択肢以外の答えを書く…")
    const dimmed = inquiry.locator('li[class*="is-dimmed"]')
    const checked = inquiry.locator('input[type="radio"]:checked')

    await inquiry.getByRole("radio", { name: /B に置く/ }).click()
    await expect(checked).toHaveCount(1)
    expect(await dimmed.count()).toBe(0)

    await answer.fill("架空の自由な答え")
    await expect(checked).toHaveCount(0)
    await expect.poll(() => dimmed.count()).toBe(3)
    await expect(inquiry.getByText("入力欄の答えで答えます")).toBeVisible()

    await inquiry.getByRole("button", { name: "広げる" }).click()
    const board = room.page.getByRole("dialog", { name: "お伺い（広げた板）" })
    await expect.poll(() => board.locator('li[class*="is-dimmed"]').count()).toBe(3)
    await room.page.keyboard.press("Escape")

    await answer.fill("")
    await expect.poll(() => dimmed.count()).toBe(0)
    await expect(checked).toHaveCount(0)
  })

  test("札の「広げる」は同じ中身を画面いっぱいの板に出し、板の中で選んで答えると板が閉じ、Esc で閉じても選んだものは札に残る", async ({
    run,
  }) => {
    const room = await run.open({
      scenario: "inquiry-question-brief-board",
      scene: "question-brief",
      viewport: "wide",
      domRoots: ["main"],
    })
    const card = inquiryOf(room.page)
    const board = room.page.getByRole("dialog", { name: "お伺い（広げた板）" })

    await card.getByRole("button", { name: "広げる" }).click()
    await expect.poll(() => board.count()).toBe(1)
    const box = await board.boundingBox()
    expect(box !== null && box.width > VIEWPORTS.wide.width - 40).toBe(true)

    await board.getByRole("radio", { name: /B に置く/ }).click()
    await room.page.keyboard.press("Escape")
    await expect.poll(() => board.count()).toBe(0)
    await expect(card.getByRole("radio", { name: /B に置く/ })).toBeChecked()

    await card.getByRole("button", { name: "広げる" }).click()
    await board.getByRole("button", { name: /次へ/ }).click()
    await expect.poll(() => board.textContent()).toContain("2 / 2")
    await board.getByRole("radio").first().click()
    await board.getByRole("button", { name: /これで答える/ }).click()

    await room.waitForEvent("question-answered")
    await expect.poll(() => board.count()).toBe(0)
    await expect.poll(() => card.count()).toBe(0)
  })

  test("preview に書いた手元の画像は棚の経路で札の中に出て、外部の URL・data:・置いていない画像は「画像を出せない」の札になる", async ({
    run,
  }) => {
    const room = await run.open({
      scenario: "inquiry-question-preview-image",
      scene: "question-preview-image",
      viewport: "wide",
      domRoots: ["main"],
      // preview が指す画像（置いていないほうの画像は置かない）。
      cwdFiles: [
        { path: "report-image-fixture/after.png", content: fictionalPng(8, 4) },
        { path: "report-image-fixture/tall.png", content: fictionalPng(4, 40) },
      ],
    })
    const inquiry = inquiryOf(room.page)

    await room.waitForPending("fake-ask-preview-image")
    // 詳細のサーフェスに出るのは選んでいる選択肢の preview だけなので、画像のある選択肢を順に選ぶ。
    for (const [choice, alt] of [
      [/横長の案/, "架空の横長の画面"],
      [/縦長の案/, "架空の縦長の画面"],
    ] as const) {
      await inquiry.getByRole("radio", { name: choice }).click()
      const image = inquiry.getByAltText(alt)
      expect(await image.getAttribute("src")).toMatch(
        /^\/report-image\/fake-ask-preview-image\/report-image-fixture%2F/,
      )
      await expect
        .poll(() =>
          image.evaluate((element) =>
            element instanceof HTMLImageElement ? element.naturalWidth : 0,
          ),
        )
        .toBeGreaterThan(0)
    }
    for (const [choice, names] of [
      [/外の画像の案/, ["架空の外部の画像", "架空の埋め込みの画像"]],
      [/置いていない画像の案/, ["架空の置いていない画像"]],
    ] as const) {
      await inquiry.getByRole("radio", { name: choice }).click()
      for (const name of names) {
        await expect
          .poll(() => inquiry.getByRole("img", { name }).evaluate((e) => e.tagName))
          .toBe("SPAN")
      }
    }
    await room.settleAndMatchPicked(ELAPSED_MS)
  })
})

function inquiryOf(page: Page): Locator {
  return page.getByRole("region", { name: "お伺い" })
}

/** `inner` の矩形が `outer` の矩形に収まっているか（転がり終わるのを poll で待つ）。 */
async function insideOf(inner: Locator, outer: Locator): Promise<boolean> {
  const [innerBox, outerBox] = await Promise.all([inner.boundingBox(), outer.boundingBox()])
  if (innerBox === null || outerBox === null) {
    return false
  }
  return (
    innerBox.y >= outerBox.y &&
    innerBox.y + innerBox.height <= outerBox.y + outerBox.height &&
    innerBox.x >= outerBox.x &&
    innerBox.x + innerBox.width <= outerBox.x + outerBox.width
  )
}
