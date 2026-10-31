// `undefined` の監査の文書（`docs/research/` の undefined-audit）の数の整合を、表の行から数え直して突き合わせる純粋関数。
// 拾う表は「## 結果」の領域の表、「### 領域ごとの理由」の表、「### 理由の種類と代表例」の表の3つと、本文の「全 N 件」。
// 列は位置で読む（領域・全件・6つに当たる・消せる・本物 / 領域・本物・内訳 / 記号・理由・件・代表例）。

/** 数が合わない箇所1つ。 */
export type UndefinedAuditViolation = {
  /** 行（1始まり）。 */
  readonly line: number
  readonly message: string
}

type Row = { readonly line: number; readonly cells: readonly string[] }

const TOTAL_LABEL = "合計"
const COLUMN_NAMES = ["全件", "6つに当たる", "消せる", "本物"]

/** 本文から、表と本文の合計の食い違いをすべて拾う。 */
export function findUndefinedAuditViolations(text: string): UndefinedAuditViolation[] {
  const lines = text.split("\n")
  const result = tableRows(lines, "## 結果")
  const reasons = tableRows(lines, "### 領域ごとの理由")
  const kinds = tableRows(lines, "### 理由の種類と代表例")
  const violations: UndefinedAuditViolation[] = []
  const report = (line: number, message: string) => violations.push({ line, message })

  const areaRows = result.filter((row) => cellText(row, 0) !== TOTAL_LABEL)
  const totalRow = result.find((row) => cellText(row, 0) === TOTAL_LABEL)
  if (areaRows.length === 0) report(1, "「## 結果」の領域の表が読めない")

  for (const row of areaRows) {
    const all = cellNumber(row, 1)
    const covered = cellNumber(row, 2)
    const removable = cellNumber(row, 3)
    const real = cellNumber(row, 4)
    if (all !== covered + removable + real) {
      report(
        row.line,
        `${cellText(row, 0)}: 全件 ${all} が 6つに当たる ${covered} + 消せる ${removable} + 本物 ${real} と合わない`,
      )
    }
  }

  if (totalRow === undefined) {
    report(1, "「## 結果」の合計行が無い")
  } else {
    COLUMN_NAMES.forEach((name, offset) => {
      const column = offset + 1
      const sum = areaRows.reduce((acc, row) => acc + cellNumber(row, column), 0)
      const written = cellNumber(totalRow, column)
      if (sum !== written) {
        report(totalRow.line, `合計行の ${name} ${written} が行の和 ${sum} と合わない`)
      }
    })
  }

  const wholeCount = /全 (\d+) 件/u.exec(text)
  if (wholeCount !== null && totalRow !== undefined) {
    const written = Number(wholeCount[1])
    const total = cellNumber(totalRow, 1)
    if (written !== total) {
      report(
        lineOf(lines, wholeCount[0]),
        `本文の「全 ${written} 件」が合計行の全件 ${total} と合わない`,
      )
    }
  }

  const realByArea = new Map(areaRows.map((row) => [cellText(row, 0), cellNumber(row, 4)]))
  const reasonAreas = new Set<string>()
  for (const row of reasons) {
    const area = cellText(row, 0)
    reasonAreas.add(area)
    const real = cellNumber(row, 1)
    const expected = realByArea.get(area)
    if (expected === undefined) {
      report(row.line, `${area}: 領域の表に無い領域`)
    } else if (real !== expected) {
      report(row.line, `${area}: 理由の表の本物 ${real} が領域の表の本物 ${expected} と合わない`)
    }
    const breakdown = [...cellText(row, 2).matchAll(/R\d+ (\d+)/gu)].reduce(
      (acc, match) => acc + Number(match[1]),
      0,
    )
    if (breakdown !== real) {
      report(row.line, `${area}: 理由の内訳の和 ${breakdown} が本物 ${real} と合わない`)
    }
  }
  for (const row of areaRows) {
    const area = cellText(row, 0)
    if (cellNumber(row, 4) > 0 && !reasonAreas.has(area)) {
      report(row.line, `${area}: 本物があるのに理由の表に行が無い`)
    }
  }

  if (totalRow !== undefined && kinds.length > 0) {
    const kindSum = kinds.reduce((acc, row) => acc + cellNumber(row, 2), 0)
    const real = cellNumber(totalRow, 4)
    if (kindSum !== real) {
      report(
        kinds[0]?.line ?? 1,
        `理由の種類の表の件の和 ${kindSum} が合計行の本物 ${real} と合わない`,
      )
    }
  }

  return violations
}

/** 数が合わない箇所1つを、一覧に出す1行にする。 */
export function formatUndefinedAuditViolation(
  path: string,
  violation: UndefinedAuditViolation,
): string {
  return `${path}:${violation.line}: ${violation.message}`
}

function tableRows(lines: readonly string[], heading: string): Row[] {
  const start = lines.findIndex((line) => line.trim() === heading)
  if (start === -1) return []
  const rows: Row[] = []
  for (let index = start + 1; index < lines.length; index += 1) {
    const line = lines[index] ?? ""
    if (/^#{1,6} /u.test(line)) break
    if (!line.startsWith("|")) continue
    const cells = line
      .slice(1, line.lastIndexOf("|"))
      .split("|")
      .map((cell) => cell.trim().replaceAll("**", ""))
    if (cells.every((cell) => /^-+$/u.test(cell))) continue
    rows.push({ line: index + 1, cells })
  }
  return rows.slice(1)
}

function cellText(row: Row, index: number): string {
  return row.cells[index] ?? ""
}

function cellNumber(row: Row, index: number): number {
  const value = Number(cellText(row, index))
  return Number.isNaN(value) ? 0 : value
}

function lineOf(lines: readonly string[], needle: string): number {
  return lines.findIndex((line) => line.includes(needle)) + 1
}
