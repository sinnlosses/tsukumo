import { describe, expect, it } from "vitest"

import {
  brokenInlineMarkCount,
  foldInlineMarks,
  parseInlineMarks,
  textOutsideInlineMarks,
} from "../../../src/shared/report/inline-mark.ts"

const BROKEN = [
  "{{12 → 8",
  "{{3 /}}",
  "{{spark: 3}}",
  "{{spark: 1 2 3 4 5 6 7 8 9 10 11 12 13}}",
  "{{spark: 1 x 3}}",
  "{{5 / 3}}",
  "{{1 / 0}}",
  "{{a → b → c}}",
  "{{ → b}}",
  "{{a_b → c}}",
  "{{x}}",
  "{{3 ／ 5}}",
] as const

describe("foldInlineMarks", () => {
  it("3 種の印を素の文字へ畳む", () => {
    expect(foldInlineMarks("前は {{12 → 8}} 秒")).toBe("前は 12 → 8 秒")
    expect(foldInlineMarks("{{3 / 5}} 件")).toBe("3/5 件")
    expect(foldInlineMarks("{{spark: 3 5 4 8}}")).toBe("▁▄▂█")
  })

  it("差の A・B は幅 16 まで（半角 1・全角 2）で、超えたら壊れた印になる", () => {
    const ok = "a".repeat(16)
    expect(foldInlineMarks(`{{${ok} → ${ok}}}`)).toBe(`${ok} → ${ok}`)
    expect(brokenInlineMarkCount(`{{${ok} → ${ok}}}`)).toBe(0)
    const over = "a".repeat(17)
    expect(foldInlineMarks(`{{${over} → 1}}`)).toBe(`{{${over} → 1}}`)
    expect(brokenInlineMarkCount(`{{${over} → 1}}`)).toBe(1)
    expect(brokenInlineMarkCount(`{{1 → ${over}}}`)).toBe(1)
    expect(brokenInlineMarkCount(`{{${"あ".repeat(8)} → 1}}`)).toBe(0)
    expect(brokenInlineMarkCount(`{{${"あ".repeat(9)} → 1}}`)).toBe(1)
  })

  it("折れ線は空白でもカンマでも区切れ、全部同じ値なら ▄ を並べる", () => {
    expect(foldInlineMarks("{{spark: 3, 5, 8, 13}}")).toBe(foldInlineMarks("{{spark: 3 5 8 13}}"))
    expect(foldInlineMarks("{{spark: 2 2 2}}")).toBe("▄▄▄")
    expect(foldInlineMarks("{{spark: 0 7}}")).toBe("▁█")
  })

  it.each(BROKEN)("壊れた印 %s は畳まず字のまま残す", (broken) => {
    expect(foldInlineMarks(broken)).toBe(broken)
    expect(textOutsideInlineMarks(broken)).toBe(broken)
  })

  it("入れ子は外側の {{ が壊れ、内側は印になる", () => {
    expect(foldInlineMarks("{{ {{3 / 5}} }}")).toBe("{{ 3/5 }}")
  })

  it("inline code の中は触らない", () => {
    expect(foldInlineMarks("`{{3 / 5}}` と {{3 / 5}}")).toBe("`{{3 / 5}}` と 3/5")
    expect(foldInlineMarks("`{{x` と ``{{12 → 8}}``")).toBe("`{{x` と ``{{12 → 8}}``")
  })

  it("1つの文に複数あっても出現順に畳み、前後の文字は欠けない", () => {
    expect(foldInlineMarks("{{12 → 8}}、{{3 / 5}}。{{x}}と{{1 / 2}}")).toBe(
      "12 → 8、3/5。{{x}}と1/2",
    )
  })
})

describe("textOutsideInlineMarks", () => {
  it("印の部分だけを取り除く", () => {
    expect(textOutsideInlineMarks("前は {{12 → 8}} 秒、{{3 / 5}}")).toBe("前は  秒、")
    expect(textOutsideInlineMarks("`{{3 / 5}}` と {{3 / 5}}")).toBe("`{{3 / 5}}` と ")
  })
})

describe("印が出力に全部残る自己テスト", () => {
  const PIECES = ["{{", "}}", "→", "/", "3", "5", " ", "`", "spark:", "x", ",", "{", "}", "\n"]

  const inputs = [
    ...BROKEN,
    "{{12 → 8}}と{{3 / 5}}と{{spark: 1 2 3}}",
    "{{ {{3 / 5}} }}",
    "`{{3 / 5}}` {{3 / 5}} `{{",
    ...Array.from({ length: 60 }, (_, seed) => randomInput(seed)),
  ]

  function randomInput(seed: number): string {
    return Array.from({ length: 14 }, (_, index) => {
      const mixed = (Math.imul(seed + 1, 2654435761) ^ Math.imul(index + 7, 40503)) >>> 0
      return PIECES[mixed % PIECES.length] ?? ""
    }).join("")
  }

  function openings(text: string): number {
    return [...text.replace(/(`+)[\s\S]*?\1/g, "").matchAll(/\{\{/g)].length
  }

  /** 畳んだ結果と印を除いた結果で、印でない `{{` が欠けず・増えず、印が残らないことを確かめる。 */
  function nothingLost(
    input: string,
    fold: (text: string) => string,
    outside: (text: string) => string,
  ): boolean {
    const rest = outside(input)
    return (
      openings(fold(input)) === openings(rest) && fold(rest) === rest && rest.length <= input.length
    )
  }

  it.each(inputs)("印でない {{ を欠かさない: %j", (input) => {
    expect(nothingLost(input, foldInlineMarks, textOutsideInlineMarks)).toBe(true)
  })

  /** 入力にある正しい印が、どれも畳んだ字として順番どおり出力に現れる。 */
  function marksKept(input: string, fold: (text: string) => string): boolean {
    const output = fold(input)
    const folded = parseInlineMarks(input).flatMap((segment) =>
      segment.kind === "mark" ? [foldInlineMarks(segment.source)] : [],
    )
    return (
      folded.reduce<number>((position, text) => {
        const found = position < 0 ? -1 : output.indexOf(text, position)
        return found < 0 ? -1 : found + text.length
      }, 0) >= 0
    )
  }

  it.each(inputs)("正しい印を順番どおり残す: %j", (input) => {
    expect(marksKept(input, foldInlineMarks)).toBe(true)
  })

  it("正しい印は件数どおり読まれる", () => {
    const marks = (text: string) =>
      parseInlineMarks(text).filter((segment) => segment.kind === "mark").length
    expect(marks("{{12 → 8}}と{{3 / 5}}と{{spark: 1 2 3}}")).toBe(3)
    expect(marks("{{ {{3 / 5}} }}")).toBe(1)
    expect(marks("`{{3 / 5}}` と {{x}}")).toBe(0)
  })

  it("正しい印を捨てる実装ではこの確かめが落ちる", () => {
    expect(marksKept("前は {{12 → 8}} 秒、{{3 / 5}}", textOutsideInlineMarks)).toBe(false)
    expect(marksKept("前は {{12 → 8}} 秒、{{3 / 5}}", foldInlineMarks)).toBe(true)
  })

  it("壊れた印を捨てる実装ではこの確かめが落ちる", () => {
    const droppingBroken = (text: string) => foldInlineMarks(text).replaceAll("{{x}}", "")
    expect(nothingLost("a{{x}}b", droppingBroken, textOutsideInlineMarks)).toBe(false)
  })
})
