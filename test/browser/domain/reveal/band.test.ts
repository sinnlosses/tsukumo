import { describe, expect, it } from "bun:test"

import {
  brushStep,
  toBands,
  type LineBox,
  type RevealBands,
} from "../../../../src/browser/domain/reveal/band.ts"

// 実際に見えている範囲（`clip-path` のポリゴン）とミニ立ち絵の見え方は目視で確かめる
// （`docs/architecture.md`「手で確かめること」）。ここで守るのは帯の割り出しと、その上の
// 時間の配り方だけ。

/** 塊を囲む枠。断りが無い限り、左端 0 ／ 右端 1000（＝いちばん広い要素の右端）とする。 */
const FRAME = { left: 0, right: 1000 } as const

function line(top: number, bottom: number, right: number): LineBox {
  return { top, bottom, right }
}

function rightsOf(bands: RevealBands): readonly number[] {
  return bands.map((band) => band.right)
}

describe("toBands（塊の行をZ字の帯に割る）", () => {
  it("行が1つも取れなければ、塊を囲む枠に落とす", () => {
    expect(toBands([], FRAME)).toEqual([{ top: 0, bottom: 0, left: 0, right: 1000 }])
  })

  it("行が1つなら1画で書き、右端はその行の右端（枠の右端ではない）", () => {
    expect(toBands([line(10, 30, 240)], FRAME)).toEqual([
      { top: 10, bottom: 30, left: 0, right: 240 },
    ])
  })

  it("2行以上は上下2つの帯に割り、切れ目は真ん中の行の下端にする", () => {
    const bands = toBands([line(0, 20, 100), line(20, 40, 100), line(40, 60, 100)], FRAME)

    expect(bands).toEqual([
      { top: 0, bottom: 40, left: 0, right: 100 },
      { top: 40, bottom: 60, left: 0, right: 100 },
    ])
  })

  it("右端は帯ごとに、その帯にある行のいちばん右になる", () => {
    const bands = toBands(
      [line(0, 20, 600), line(20, 40, 400), line(40, 60, 180), line(60, 80, 120)],
      FRAME,
    )

    expect(rightsOf(bands)).toEqual([600, 180])
  })

  it("行の順番はこちらで整えるので、渡す並びは問わない", () => {
    const shuffled = toBands([line(40, 60, 180), line(0, 20, 600), line(20, 40, 400)], FRAME)

    expect(rightsOf(shuffled)).toEqual([600, 180])
  })

  it("縦に重なる矩形は1行にまとめ、右端は広いほうを取る（表のセル・行の中の `<code>`）", () => {
    const bands = toBands(
      [line(0, 20, 300), line(4, 16, 520), line(20, 40, 100), line(40, 60, 90)],
      FRAME,
    )

    // 重なる2つが1行になるので、行は3本（右端 520 / 100 / 90）で上に2本・下に1本に割れる。
    expect(bands).toEqual([
      { top: 0, bottom: 40, left: 0, right: 520 },
      { top: 40, bottom: 60, left: 0, right: 90 },
    ])
  })

  it("行が塊の左端より左で終わっていても、右端が左端より左には来ない", () => {
    expect(toBands([line(0, 20, -50)], { left: 40, right: 1000 })).toEqual([
      { top: 0, bottom: 20, left: 40, right: 40 },
    ])
  })
})

describe("brushStep（帯の上の筆の居場所）", () => {
  it("1画の塊は、最初から最後までその1本をなぞる", () => {
    const bands = toBands([line(0, 20, 300)], FRAME)

    expect(brushStep(bands, 0).writtenX).toBe(0)
    expect(brushStep(bands, 0.5).writtenX).toBe(150)
    expect(brushStep(bands, 1)).toEqual({
      filled: 0,
      bottom: 20,
      writtenX: 300,
      swept: 1,
      tipX: 300,
      tipTop: 0,
      tipBottom: 20,
      stroke: "sweep",
    })
  })

  it("最後は帯の右端まで出し切る（枠の右端まで滑らない）", () => {
    const bands = toBands([line(0, 20, 600), line(20, 40, 120)], FRAME)

    expect(brushStep(bands, 1).writtenX).toBe(120)
  })

  it("横画の時間を帯の幅で按分するので、帯が変わっても筆の速さは変わらない", () => {
    const bands = toBands([line(0, 20, 300), line(20, 40, 100)], FRAME)
    // 幅 300 と 100 なので、横画の持ち時間は 0.675 と 0.225（合わせて 2 × SWEEP_SHARE）。
    const upper = speedAround(bands, 0.2, 0.4)
    const lower = speedAround(bands, 0.8, 0.9)

    expect(lower).toBeCloseTo(upper, 6)
  })

  it("斜めに戻るあいだは何も出さず、直前の帯を出し切ったままにする", () => {
    const bands = toBands([line(0, 20, 300), line(20, 40, 100)], FRAME)
    // 上の帯の横画は 0.675 で終わり、0.775 までが戻り。その真ん中を見る。
    const step = brushStep(bands, 0.725)

    expect(step.stroke).toBe("return")
    expect(step.swept).toBe(0)
    expect(step.filled).toBe(20)
    expect(step.bottom).toBe(20)
    expect(step.writtenX).toBe(0)
    // 筆先だけが右から左へ戻り、次の帯へ下りていく。
    expect(step.tipX).toBeLessThan(300)
    expect(step.tipX).toBeGreaterThan(0)
    expect(step.tipBottom).toBeGreaterThan(20)
  })

  it("幅が取れない塊（まだレイアウトされていない）でも時間を配れる", () => {
    const bands = toBands([], FRAME)

    expect(brushStep(bands, 0.5).swept).toBe(0.5)
  })
})

/** `from` から `to` のあいだに筆が進んだ距離を、時間で割った値（正規化した時間あたりの px）。 */
function speedAround(bands: RevealBands, from: number, to: number): number {
  return (brushStep(bands, to).writtenX - brushStep(bands, from).writtenX) / (to - from)
}
