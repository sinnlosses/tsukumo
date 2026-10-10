import { commentLineIndexes } from "./comment-line.ts"

type TopLevelFunction = {
  readonly name: string
  readonly exported: boolean
  readonly line: number
}

const FUNCTION_DECLARATION =
  /^(export\s+)?(?:default\s+)?(?:async\s+)?function\b\s*\*?\s*([A-Za-z_$][\w$]*)?/
const FUNCTION_CONST =
  /^(export\s+)?const\s+([A-Za-z_$][\w$]*)\s*(?::[^=]+)?=\s*(?:async\s+)?(?:function\b|\(|[A-Za-z_$][\w$]*\s*=>|<)/
const EXPORT_LIST = /^export\s*\{([^}]*)\}\s*;?\s*$/

/**
 * export する関数が、export しない関数より後ろにあるものを、メッセージにして返す。
 * 数えるのは行頭に字下げの無い関数宣言と、`const` に入れた関数式・アロー関数。
 * `export { a }`（`from` なし）は指す宣言を export 扱いにする。
 */
export function functionOrderViolations(file: string, source: string): ReadonlyArray<string> {
  const functions = topLevelFunctions(source)
  return functions.flatMap((fn, index) => {
    const earlierInternal = functions.slice(0, index).find((other) => !other.exported)
    return fn.exported && earlierInternal !== undefined
      ? [
          `${file}: export の ${fn.name}（${fn.line} 行目）が export しない ${earlierInternal.name}（${earlierInternal.line} 行目）より後ろ`,
        ]
      : []
  })
}

function topLevelFunctions(source: string): ReadonlyArray<TopLevelFunction> {
  const lines = source.split("\n")
  const skipped = new Set(commentLineIndexes(lines))
  const listed = new Set(
    lines.flatMap((line) => {
      const names = EXPORT_LIST.exec(line)?.[1]
      return names === undefined
        ? []
        : names.split(",").map((entry) => (entry.split(/\s+as\s+/)[0] ?? "").trim())
    }),
  )
  return lines.flatMap((line, index) => {
    if (skipped.has(index)) return []
    const declaration = FUNCTION_DECLARATION.exec(line)
    const constant = declaration === null ? FUNCTION_CONST.exec(line) : null
    const exportKeyword = declaration?.[1] ?? constant?.[1]
    const name = declaration === null ? constant?.[2] : (declaration[2] ?? "default")
    if (name === undefined) return []
    return [{ name, exported: exportKeyword !== undefined || listed.has(name), line: index + 1 }]
  })
}
