// 表の出力を、土台の要素の違い（Astryx の `Table` の class・属性）に依らない形に畳む道具。
// 区画ごとの行・セルの字・揃え・セルの下に置いた印の class を取り出し、旧い Markdown の経路と直に比べる。

type CellShape = {
  readonly tag: string
  readonly text: string
  readonly align: string
  readonly hidden: boolean
  readonly colspan: string
  readonly sort: string
  readonly marks: readonly string[]
}

type RowShape = {
  readonly section: string
  readonly rowClasses: readonly string[]
  readonly cells: readonly CellShape[]
}

export type TableShape = {
  readonly tables: readonly (readonly RowShape[])[]
  readonly outside: string
}

/** 土台の部品が付ける class（Astryx の stable class と StyleX の atomic class）。 */
function isFoundationClass(name: string): boolean {
  return name.startsWith("astryx-") || /^x[0-9a-z]+$/.test(name)
}

function ownClasses(element: Element): readonly string[] {
  return [...element.classList].filter((name) => !isFoundationClass(name)).toSorted()
}

function cellShapeOf(cell: Element): CellShape {
  const marks = [...cell.querySelectorAll("*")].flatMap((element) => ownClasses(element))
  const textAlign = cell instanceof HTMLElement ? cell.style.textAlign : ""
  return {
    tag: cell.tagName,
    text: cell.textContent,
    align: textAlign === "" ? "left" : textAlign,
    hidden: cell.getAttribute("aria-hidden") === "true",
    colspan: cell.getAttribute("colspan") ?? "",
    sort: cell.getAttribute("aria-sort") ?? "",
    marks: [...ownClasses(cell), ...marks],
  }
}

/** 表の外側（器・題・欄外注など）は、表を取り除いた HTML のまま比べる。 */
export function tableShapeOf(html: string): TableShape {
  const template = document.createElement("template")
  template.innerHTML = html
  const root = template.content
  const tables = [...root.querySelectorAll("table")].map((table) =>
    [...table.querySelectorAll("tr")].map((row) => ({
      section: row.parentElement?.tagName ?? "",
      rowClasses: ownClasses(row),
      cells: [...row.children].map(cellShapeOf),
    })),
  )
  for (const table of root.querySelectorAll("table")) {
    table.replaceWith(document.createComment("table"))
  }
  const holder = document.createElement("div")
  holder.append(root)
  return { tables, outside: holder.innerHTML }
}
