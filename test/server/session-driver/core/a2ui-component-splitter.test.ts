import { describe, expect, it } from "vitest"

import {
  INITIAL_SPLIT_STATE,
  mismatchCount,
  splitComponents,
} from "../../../../src/server/session-driver/core/a2ui-component-splitter.ts"

const COMPONENTS = [
  { id: "root", component: "Report", children: ["s1", "s2"] },
  { id: "s1", component: "Section", heading: '見出し {括弧} と "引用" と ] と \\', children: [] },
  { id: "s2", component: "Text", text: '1234 \\" } { [ ]' },
]

const WHOLE = JSON.stringify({ title: "題", components: COMPONENTS, tail: ["x", { y: 1 }] })

function splitAll(fragments: readonly string[]): readonly unknown[] {
  return fragments.reduce<{ state: typeof INITIAL_SPLIT_STATE; components: readonly unknown[] }>(
    (acc, fragment) => {
      const step = splitComponents(acc.state, fragment)
      return { state: step.state, components: [...acc.components, ...step.components] }
    },
    { state: INITIAL_SPLIT_STATE, components: [] },
  ).components
}

describe("部分 JSON から部品を 1 つずつ切り出す読み手", () => {
  it("2 つに割る位置を全部回しても、全文を読んだ結果と一致する", () => {
    for (let cut = 0; cut <= WHOLE.length; cut += 1) {
      const got = splitAll([WHOLE.slice(0, cut), WHOLE.slice(cut)])
      expect(got).toEqual(COMPONENTS)
    }
  })

  it("1 字ずつ与えても一致し、要素が閉じる前には何も返さない", () => {
    expect(splitAll([...WHOLE])).toEqual(COMPONENTS)
    const openIndex = WHOLE.indexOf('"id":"s1"')
    expect(splitAll([WHOLE.slice(0, openIndex)])).toHaveLength(1)
  })

  it("空の components・最後でない欄・components の前の欄でも合う", () => {
    expect(splitAll(['{"components":[],"a":[{"id":"x"}]}'])).toEqual([])
    expect(splitAll(['{"a":{"components":[{"id":"no"}]},"components":[{"id":"yes"}]}'])).toEqual([
      { id: "yes" },
    ])
  })

  it("取りこぼした列は、全文との突き合わせで不一致になる", () => {
    expect(mismatchCount(COMPONENTS, WHOLE)).toBe(0)
    expect(mismatchCount(COMPONENTS.slice(1), WHOLE)).toBeGreaterThan(0)
  })
})
