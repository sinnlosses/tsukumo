/** 値を再帰で歩き、`description` の文字列を全部集める（位置を問わない）。 */
export function descriptionsIn(value: unknown): readonly string[] {
  if (Array.isArray(value)) {
    return value.flatMap(descriptionsIn)
  }
  if (typeof value !== "object" || value === null) {
    return []
  }
  return Object.entries(value).flatMap(([key, child]) =>
    key === "description" && typeof child === "string" ? [child] : descriptionsIn(child),
  )
}

/** 説明のうち、どれかの行が `// ` の行として型の表記に無いもの。 */
export function missingDescriptions(
  descriptions: readonly string[],
  text: string,
): readonly string[] {
  return descriptions.filter((description) =>
    description.split("\n").some((line) => !text.includes(`// ${line}\n`)),
  )
}
