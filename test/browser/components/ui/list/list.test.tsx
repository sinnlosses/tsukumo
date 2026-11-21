import { cleanup, render } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"

import { List, ListItem } from "../../../../../src/browser/components/ui/list/list.tsx"

afterEach(cleanup)

const LONG = "とても長いラベルの項目"

function leafWith(container: HTMLElement, text: string): Element | undefined {
  return [...container.querySelectorAll("*")].find(
    (el) => el.children.length === 0 && el.textContent === text,
  )
}

describe("List", () => {
  it("文字列のラベルは要素に包んで渡り、Astryx の1行で切る経路に乗らない", () => {
    const { container } = render(
      <List hasDividers={false} numbered={false}>
        <ListItem label={LONG} />
      </List>,
    )

    const leaf = leafWith(container, LONG)
    expect(leaf?.tagName).toBe("SPAN")
    expect(leaf?.parentElement?.textContent).toBe(LONG)
  })

  it("説明も要素に包んで渡り、印と右端を出す", () => {
    const { container } = render(
      <List hasDividers numbered={false}>
        <ListItem mark="●" label="題" description="説明" end="済" />
      </List>,
    )

    expect(leafWith(container, "説明")?.tagName).toBe("SPAN")
    expect(container.textContent).toContain("●")
    expect(container.textContent).toContain("済")
  })
})
