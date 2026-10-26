/** 名前ごとに「出た行の数」を数えた表。`knownNames` は0件でも出す。`total` は割合の分母で、既定は行の数。 */
export function table<Row>(
  title: string,
  knownNames: readonly string[],
  usageRecords: readonly Row[],
  namesOf: (record: Row) => readonly string[],
  total: number = usageRecords.length,
): string {
  const names = [...new Set([...knownNames, ...usageRecords.flatMap(namesOf)])].toSorted()
  const rows = names.map((name) => {
    const count = usageRecords.filter((record) => namesOf(record).includes(name)).length
    const percent = (total === 0 ? 0 : (count / total) * 100).toFixed(1)
    return `  ${name.padEnd(26)} ${String(count).padStart(5)}  ${percent.padStart(5)}%`
  })
  return [`${title}:`, ...rows].join("\n")
}
