// 撮影の道具が最狭の窓で測る、文字を持つ要素の行数と省略の有無。前後の差を折れとして出す。

export type WrapRow = {
  readonly key: string
  readonly lines: number
  readonly ellipsed: boolean
}

export type WrapDiff = {
  readonly grown: readonly {
    readonly key: string
    readonly before: number
    readonly after: number
  }[]
  readonly newlyEllipsed: readonly string[]
  readonly onlyBefore: number
  readonly onlyAfter: number
}

/**
 * ページの中で走らせる測り（`page.evaluate` に渡すので、外の識別子を使わない）。
 * 空でない文字列を直接の子に持つ表示中の要素ごとに、行数（高さ ÷ 行の高さ）と省略の有無を返す。
 * 鍵は、最も近い `data-region` を持つ祖先（無ければ body）からの「タグ名:nth-of-type」の道筋。
 * class は組み立てのたびにハッシュが変わるので鍵に使わない。
 */
export function measureWrapRows(): WrapRow[] {
  const rows: WrapRow[] = []
  for (const element of Array.from(document.body.querySelectorAll("*"))) {
    const hasText = Array.from(element.childNodes).some(
      (node) => node.nodeType === Node.TEXT_NODE && (node.textContent ?? "").trim() !== "",
    )
    if (!hasText) {
      continue
    }
    const rect = element.getBoundingClientRect()
    const style = getComputedStyle(element)
    if (style.display === "none" || rect.height === 0) {
      continue
    }
    const fontSize = Number.parseFloat(style.fontSize)
    const parsed = Number.parseFloat(style.lineHeight)
    const lineHeight = Number.isNaN(parsed) ? fontSize * 1.2 : parsed
    const steps: string[] = []
    let current = element
    while (current !== document.body) {
      const region = current.getAttribute("data-region")
      if (region !== null) {
        steps.unshift(`[data-region="${region}"]`)
        break
      }
      const parent = current.parentElement
      if (parent === null) {
        break
      }
      const tag = current.tagName
      const position = Array.from(parent.children).filter((child) => child.tagName === tag)
      steps.unshift(`${tag.toLowerCase()}:nth-of-type(${String(position.indexOf(current) + 1)})`)
      current = parent
    }
    rows.push({
      key: steps.join(" > "),
      lines: Math.max(1, Math.round(rect.height / lineHeight)),
      ellipsed: style.textOverflow === "ellipsis" && element.scrollWidth > element.clientWidth,
    })
  }
  return rows
}

/** 両側にある鍵だけを比べ、行数が増えたもの・新しく省略されたものを返す。片側にしか無い鍵は件数だけ数える。 */
export function diffWrapRows(before: readonly WrapRow[], after: readonly WrapRow[]): WrapDiff {
  const beforeByKey = new Map(before.map((row) => [row.key, row]))
  const afterKeys = new Set(after.map((row) => row.key))
  const grown: { key: string; before: number; after: number }[] = []
  const newlyEllipsed: string[] = []
  let onlyAfter = 0
  for (const row of after) {
    const earlier = beforeByKey.get(row.key)
    if (earlier === undefined) {
      onlyAfter += 1
      continue
    }
    if (row.lines > earlier.lines) {
      grown.push({ key: row.key, before: earlier.lines, after: row.lines })
    }
    if (!earlier.ellipsed && row.ellipsed) {
      newlyEllipsed.push(row.key)
    }
  }
  const onlyBefore = before.filter((row) => !afterKeys.has(row.key)).length
  return { grown, newlyEllipsed, onlyBefore, onlyAfter }
}

/** 窓ごとの差を出力の行にする。 */
export function formatWrapDiff(size: string, diff: WrapDiff): string {
  const lines = [`窓 ${size}`]
  if (diff.grown.length === 0 && diff.newlyEllipsed.length === 0) {
    lines.push("折れの増加なし")
  }
  for (const row of diff.grown) {
    lines.push(`${row.key}: 行数 ${String(row.before)}→${String(row.after)}`)
  }
  for (const key of diff.newlyEllipsed) {
    lines.push(`省略が出た: ${key}`)
  }
  if (diff.onlyBefore > 0 || diff.onlyAfter > 0) {
    lines.push(
      `片側にしか無い要素: 前だけ ${String(diff.onlyBefore)} 件、後だけ ${String(diff.onlyAfter)} 件`,
    )
  }
  return `${lines.join("\n")}\n`
}
