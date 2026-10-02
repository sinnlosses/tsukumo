// 吊り札の開くリストを持つ選択の口（`RunSettingSelect`）。選択肢の描画・`onChange`・disabled の
// 絞り込みをここで測る。地・枠・角などの見た目は目視で確かめる（`docs/architecture/testing.md`）。

import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"

import { RunSettingSelect } from "../../../../../../src/browser/components/domain/sidebar/components/run-setting-select.tsx"
import { typedElement } from "../../../../../typed-element.ts"

afterEach(() => {
  cleanup()
})

function select(): HTMLSelectElement {
  return typedElement(screen.getByLabelText("架空のラベル"), HTMLSelectElement, "吊り札の <select>")
}

describe("RunSettingSelect", () => {
  it("選択肢を出し、いまの値を選択する", () => {
    render(
      <RunSettingSelect
        id="run-setting-select-fixture"
        ariaLabel="架空のラベル"
        heading="架空の見出し"
        value="b"
        options={[
          { value: "a", disabled: false, icon: "A", row: "A の行" },
          { value: "b", disabled: false, icon: "B", row: "B の行" },
        ]}
        disabled={false}
        danger={false}
        rail={false}
        layout="list"
        title={undefined}
        onChange={() => {}}
      />,
    )

    expect(select().value).toBe("b")
    expect(select().options).toHaveLength(2)
    expect(screen.getByText("架空の見出し")).toBeDefined()
    expect(screen.getByText("A の行")).toBeDefined()
    expect(screen.getByText("B の行")).toBeDefined()
  })

  it("変更で onChange に選ばれた値を渡す", () => {
    const calls: string[] = []
    render(
      <RunSettingSelect
        id="run-setting-select-fixture"
        ariaLabel="架空のラベル"
        heading="架空の見出し"
        value="a"
        options={[
          { value: "a", disabled: false, icon: "A", row: "A の行" },
          { value: "b", disabled: false, icon: "B", row: "B の行" },
        ]}
        disabled={false}
        danger={false}
        rail={false}
        layout="list"
        title={undefined}
        onChange={(value) => calls.push(value)}
      />,
    )

    fireEvent.change(select(), { target: { value: "b" } })

    expect(calls).toEqual(["b"])
  })

  it("選択肢ごとの disabled がその行だけに効く", () => {
    render(
      <RunSettingSelect
        id="run-setting-select-fixture"
        ariaLabel="架空のラベル"
        heading="架空の見出し"
        value="a"
        options={[
          { value: "a", disabled: false, icon: "A", row: "A の行" },
          { value: "b", disabled: true, icon: "B", row: "B の行" },
        ]}
        disabled={false}
        danger={false}
        rail={false}
        layout="list"
        title={undefined}
        onChange={() => {}}
      />,
    )

    const options = select().options
    expect(options[0]?.disabled).toBe(false)
    expect(options[1]?.disabled).toBe(true)
  })

  it("disabled のとき <select> 自身も選べなくなり、title が理由を見せる", () => {
    render(
      <RunSettingSelect
        id="run-setting-select-fixture"
        ariaLabel="架空のラベル"
        heading="架空の見出し"
        value="a"
        options={[{ value: "a", disabled: false, icon: "A", row: "A の行" }]}
        disabled={true}
        danger={false}
        rail={false}
        layout="list"
        title="架空の理由"
        onChange={() => {}}
      />,
    )

    expect(select().disabled).toBe(true)
    expect(select().title).toBe("架空の理由")
  })
})
