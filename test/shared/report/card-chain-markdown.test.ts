import { describe, expect, it } from "vitest"

import { cardChainHtml } from "../../../src/shared/report/card-chain-markdown.ts"
import { graphMarkdown } from "../../fixture/report-markdown.ts"

const chain = (names: readonly string[]): string =>
  names
    .slice(1)
    .map((name, index) => `${names[index] ?? ""} -> ${name}`)
    .join("\n")

/** カードの連鎖に並んだ節点の名前（上から順）。一本道でなければ `undefined`。 */
const cardNamesOf = (source: string): readonly string[] | undefined => {
  const html = cardChainHtml(source)
  return html === undefined
    ? undefined
    : [...html.matchAll(/<span class="card-chain-name">([^<]*)<\/span>/gu)].map(
        (match) => match[1] ?? "",
      )
}

describe("cardChainHtml の一本道の判定", () => {
  it("2〜5 節点の一本道は、始点から辿った順にカードを並べる（書いた順に依らない）", () => {
    expect(cardNamesOf("乙 -> 丙\n甲 -> 乙")).toEqual(["甲", "乙", "丙"])
    expect(cardNamesOf(chain(["a", "b", "c", "d", "e"]))).toEqual(["a", "b", "c", "d", "e"])
  })

  it.each([
    ["6 節点", chain(["a", "b", "c", "d", "e", "f"])],
    ["分岐の節点 {}", "a -> {b?}\n{b?} -> c"],
    ["分岐（出次数2）", "a -> b\na -> c"],
    ["合流（入次数2）", "a -> c\nb -> c"],
    ["囲みあり", "[群]\na\n[]\na -> b"],
    ["点線あり", "a -> b\nb -.> c"],
    ["節点が1つ", "a"],
    ["輪", "a -> b\nb -> a"],
  ])("%s は一本道ではないので undefined", (_, source) => {
    expect(cardChainHtml(source)).toBeUndefined()
  })
})

describe("cardChainHtml", () => {
  it("名前・説明・色の目印の帯・辺のラベルをカードの連鎖にする", () => {
    const html = cardChainHtml("甲 | 説明 <b> @a\n甲 -> 乙: 渡す\n乙")

    expect(html).toBe(
      '<ol class="card-chain" aria-label="連鎖">' +
        '<li class="card-chain-card"><span class="card-chain-tone card-chain-tone-a" aria-hidden="true"></span><span class="card-chain-name">甲</span><span class="card-chain-note">説明 &lt;b&gt;</span></li>' +
        '<li class="card-chain-arrow" aria-hidden="true"><span class="card-chain-edge">渡す</span></li>' +
        '<li class="card-chain-card"><span class="card-chain-name">乙</span></li></ol>',
    )
  })

  it("行頭の + - ~ を節点と辺の class にする", () => {
    const html = cardChainHtml("+ 甲\n甲 -> 乙\n~ 乙 -> 丙")

    expect(html).toContain('<li class="card-chain-card card-chain-added">')
    expect(html).toContain('<li class="card-chain-arrow card-chain-changed"')
  })

  it("辺の色の目印を矢印の class にし、印があれば印の class を後ろに並べる", () => {
    const html = cardChainHtml("甲 -> 乙: 渡す @a\n+ 乙 -> 丙 @b")

    expect(html).toContain('<li class="card-chain-arrow card-chain-tone-a"')
    expect(html).toContain('<li class="card-chain-arrow card-chain-tone-b card-chain-added"')
  })
})

describe("graph の塊", () => {
  it("5 節点の一本道はカードの連鎖になり、mermaid のフェンスを持たない", () => {
    const markdown = graphMarkdown(chain(["a", "b", "c", "d", "e"]))

    expect(markdown).toContain('class="card-chain"')
    expect(markdown).not.toContain("```mermaid")
  })

  it("6 節点と分岐ありは mermaid のまま", () => {
    expect(graphMarkdown(chain(["a", "b", "c", "d", "e", "f"]))).toContain("```mermaid")
    expect(graphMarkdown("a -> b\na -> c")).toContain("```mermaid")
  })

  it("カードの連鎖の凡例には形の見本を出さず、同じ形の並びの mermaid の凡例には出す", () => {
    const source = "(甲)\n乙\n(甲) -> 乙"

    expect(graphMarkdown(source)).not.toContain("graph-legend-shape")
    expect(graphMarkdown(`${source}\n乙 -> 丙\n丙 -> 丁\n丁 -> 戊\n戊 -> 己`)).toContain(
      "graph-legend-shape",
    )
  })

  it("カードの連鎖の下にも凡例が出る", () => {
    const markdown = graphMarkdown("甲 @a\n甲 -> 乙", "", [{ tone: "a", label: "規約" }])

    expect(markdown).toContain("graph-legend-tone-a")
  })
})
