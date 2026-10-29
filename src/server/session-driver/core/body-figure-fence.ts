// 本文の `figure` フェンス（図の申告）を `plot` の塊に読む。
// 書き手が書くのは問い・関係・データだけで、形は決定表が決める。

import { plotBlockSchema, type ReportPlot } from "../../../shared/report/figure-grammar.ts"

const KEY_LINE = /^(question|relation|form|unit|keys|data)\s*[:：]\s*(.*)$/
const COLUMN_TYPES = ["N", "O", "T"] as const
const NAME_COLUMN = "項目"
const VALUE_COLUMN = "値"

type Header = Readonly<Record<string, string>>

/**
 * `figure` フェンスの中身を `plot` に読む。読めない（欠けた欄・数でない値・行の形の不揃い・`plot` の検査に落ちる）ときは undefined。
 */
export function readFigureFence(content: string): ReportPlot | undefined {
  const lines = content.split("\n")
  const dataAt = lines.findIndex((line) => /^data\s*[:：]/.test(line))
  if (dataAt < 0) {
    return undefined
  }
  const header = headerOf(lines.slice(0, dataAt + 1))
  const rows = lines
    .slice(dataAt + 1)
    .map((line) => line.trim())
    .filter((line) => line !== "")
  const keyType = keyTypeOf(header.keys, header.relation)
  const columns = keyType === undefined ? undefined : columnsOf(rows, keyType, header.unit)
  if (columns === undefined) {
    return undefined
  }
  const parsed = plotBlockSchema.safeParse({
    kind: "plot",
    question: header.question ?? "",
    relation: header.relation,
    ...(header.form === undefined ? {} : { form: header.form }),
    data: columns,
  })
  return parsed.success ? parsed.data : undefined
}

function headerOf(lines: readonly string[]): Header {
  return Object.fromEntries(
    lines.flatMap((line) => {
      const match = KEY_LINE.exec(line)
      const key = match?.[1]
      const value = match?.[2]
      return key === undefined || value === undefined || key === "data"
        ? []
        : [[key, value.replace(/\s+#.*$/, "").trim()]]
    }),
  )
}

/** 名前の列の型。省けば `trend`・`change` は T、それ以外は N。 */
function keyTypeOf(
  keys: string | undefined,
  relation: string | undefined,
): (typeof COLUMN_TYPES)[number] | undefined {
  if (keys === undefined) {
    return relation === "trend" || relation === "change" ? "T" : "N"
  }
  return COLUMN_TYPES.find((type) => type === keys)
}

type Column = {
  readonly name: string
  readonly type: string
  readonly values: readonly (string | number)[]
}

function columnsOf(
  rows: readonly string[],
  keyType: string,
  unit: string | undefined,
): readonly Column[] | undefined {
  const valueName = unit === undefined || unit === "" ? VALUE_COLUMN : unit
  const pairs = rows.map((row) => /^(.+?)\s*[:：]\s*(.+)$/.exec(row))
  if (rows.length > 0 && pairs.every((pair) => pair !== null)) {
    const values = pairs.map((pair) => toNumber(pair?.[2]))
    return values.every((value) => value !== undefined)
      ? [
          {
            name: NAME_COLUMN,
            type: keyType,
            values: pairs.map((pair) => (pair?.[1] ?? "").trim()),
          },
          { name: valueName, type: "Q", values },
        ]
      : undefined
  }
  const cells = rows.map((row) => row.split(/\s*[,，]\s*/))
  if (rows.length > 0 && cells.every((row) => row.length === 2)) {
    const xs = cells.map((row) => toNumber(row[0]))
    const ys = cells.map((row) => toNumber(row[1]))
    return xs.every((value) => value !== undefined) && ys.every((value) => value !== undefined)
      ? [
          { name: "x", type: "Q", values: xs },
          { name: "y", type: "Q", values: ys },
        ]
      : undefined
  }
  const singles = rows.map((row) => toNumber(row))
  return rows.length > 0 && singles.every((value) => value !== undefined)
    ? [{ name: valueName, type: "Q", values: singles }]
    : undefined
}

function toNumber(text: string | undefined): number | undefined {
  if (text === undefined || text.trim() === "") {
    return undefined
  }
  const value = Number(text.trim())
  return Number.isFinite(value) ? value : undefined
}
