// デザイントークンの検査が使う、CSS の宣言の読みと、余白・角丸・影・transition の値の判定。

import { readFileSync } from "node:fs"

import { listSourceFiles, SRC_ROOT } from "./source-file.ts"

/** 部品の CSS（theme.css を除く）ごとに count の値を数え、0 のファイルを落とす。 */
export function countByBrowserCss(
  count: (css: string) => number,
): Readonly<Record<string, number>> {
  return Object.fromEntries(
    listSourceFiles(SRC_ROOT, SRC_ROOT, [".css"])
      .filter((relPath) => relPath.startsWith("browser/") && relPath !== "browser/styles/theme.css")
      .flatMap((relPath) => {
        const value = count(readFileSync(`${SRC_ROOT}/${relPath}`, "utf8"))
        return value > 0 ? [[relPath, value] as const] : []
      }),
  )
}

/** 数えた結果と上限の表を比べ、増えたファイルと減ったファイルを「パス: 実数（上限 n）」の行で返す。 */
export function compareWithLimits(
  actual: Readonly<Record<string, number>>,
  limits: Readonly<Record<string, number>>,
): { readonly increased: string; readonly decreased: string } {
  const increased = Object.entries(actual)
    .filter(([relPath, count]) => count > (limits[relPath] ?? 0))
    .map(([relPath, count]) => `${relPath}: ${count}（上限 ${limits[relPath] ?? 0}）`)
  const decreased = Object.entries(limits)
    .filter(([relPath, count]) => (actual[relPath] ?? 0) < count)
    .map(([relPath, count]) => `${relPath}: ${actual[relPath] ?? 0}（上限 ${count}）`)
  return { increased: increased.join("\n"), decreased: decreased.join("\n") }
}

const DECLARATION =
  /(?<![\w-])((?:padding|margin)(?:-[a-z]+)*|(?:row-|column-)?gap|border(?:-[a-z]+)*-radius|box-shadow|transition(?:-duration)?)\s*:\s*([^;{}]+)/g

export function hardcodedDeclarations(css: string): readonly string[] {
  const withoutComments = css.replace(/\/\*[\s\S]*?\*\//g, "")
  return [...withoutComments.matchAll(DECLARATION)].flatMap((match) => {
    const [, property = "", rawValue = ""] = match
    const value = rawValue.trim()
    return isAllowedDeclaration(property, value) ? [] : [`${property}: ${value}`]
  })
}

export function rawScaleReferenceCount(css: string): number {
  const withoutComments = css.replace(/\/\*[\s\S]*?\*\//g, "")
  return [...withoutComments.matchAll(/(?<![\w-])(-{0,2}[a-z][\w-]*)\s*:\s*([^;{}]+)/g)].filter(
    (match) => /var\(--space-[\w-]+/.test(match[2] ?? ""),
  ).length
}

export function marginDeclarationCount(css: string): number {
  const withoutComments = css.replace(/\/\*[\s\S]*?\*\//g, "")
  return [...withoutComments.matchAll(/(?<![\w-])margin(?:-[a-z]+)*\s*:\s*([^;{}]+)/g)].filter(
    (match) => (match[1] ?? "").trim() !== "0",
  ).length
}

export function isAllowedSpace(value: string): boolean {
  return splitTopLevel(value, /\s/).every(isAllowedSpaceToken)
}

export function isAllowedRadius(value: string): boolean {
  return splitTopLevel(value.replace(/\//g, " "), /\s/).every((token) => {
    if (token === "0" || token.endsWith("%") || TOKEN_REFERENCE.test(token)) return true
    const px = /^([\d.]+)px$/.exec(token)
    return px !== null && Number(px[1]) >= 999
  })
}

export function isAllowedShadow(value: string): boolean {
  const trimmed = value.trim()
  if (trimmed === "none" || /^var\(--shadow-[\w-]+\)$/.test(trimmed) || /\binset\b/.test(trimmed)) {
    return true
  }
  return splitTopLevel(trimmed, /,/).every((layer) => {
    const lengths =
      layer
        .replace(/(?:rgb|color-mix|var)\((?:[^()]|\([^()]*\))*\)/g, "")
        .match(/-?[\d.]+(?:px|rem)?/g) ?? []
    const [x = 0, y = 0, blur = 0] = lengths.map(parseFloat)
    return blur === 0 || x !== 0 || y < 0
  })
}

export function isAllowedTransition(value: string): boolean {
  const trimmed = value.trim()
  return (
    trimmed === "none" ||
    splitTopLevel(trimmed, /,/).every((layer) => layer.includes("var(--motion-"))
  )
}

function isAllowedDeclaration(property: string, value: string): boolean {
  if (/^(padding|margin|gap|row-gap|column-gap)/.test(property)) {
    return isAllowedSpace(value)
  }
  if (property.endsWith("radius")) {
    return isAllowedRadius(value)
  }
  if (property === "box-shadow") {
    return isAllowedShadow(value)
  }
  return isAllowedTransition(value)
}

const TOKEN_REFERENCE = /^var\(--[\w-]+\)$/

function isAllowedSpaceToken(token: string): boolean {
  if (token === "0" || token === "auto" || TOKEN_REFERENCE.test(token)) return true
  if (/^-?[\d.]+(em|%)$/.test(token)) return true
  const fallback = /^var\(--[\w-]+,\s*(.+)\)$/.exec(token)
  if (fallback !== null) return isAllowedSpaceToken((fallback[1] ?? "").trim())
  if (token.startsWith("calc(") && token.endsWith(")")) {
    const parts =
      token
        .slice(5, -1)
        .match(
          /env\((?:[^()]|\([^()]*\))*\)|var\((?:[^()]|\([^()]*\))*\)|-?[\d.]+[a-z%]*|[-+*/]/g,
        ) ?? []
    const allowedParts = parts.every(
      (part) =>
        /^[-+*/]$/.test(part) ||
        part.startsWith("env(") ||
        /^-?[\d.]+$/.test(part) ||
        /^-?[\d.]+(?:em|%)$/.test(part) ||
        TOKEN_REFERENCE.test(part) ||
        /^var\(--(?!space-)/.test(part) ||
        isAllowedSpaceToken(part),
    )
    return allowedParts && isOnScale(parts)
  }
  return false
}

/** theme.css の --space-* 宣言（rem × 16）から読んだ、段の名前から px への表。 */
function readSpaceScalePx(): Readonly<Record<string, number>> {
  const theme = readFileSync(`${SRC_ROOT}/browser/styles/theme.css`, "utf8")
  return Object.fromEntries(
    [...theme.matchAll(/(--space-[\w-]+)\s*:\s*([\d.]+)rem\s*;/g)].map(
      (match) => [match[1] ?? "", Number(match[2]) * 16] as const,
    ),
  )
}

/** 尺度のトークンと数だけの calc は結果が尺度の段に乗るかを見る。局所のつまみ・env()・em・% を含むものは値が決まらないので通す。theme.css に無い段のトークンは拒む。 */
function isOnScale(parts: readonly string[]): boolean {
  if (
    parts.some((part) =>
      /^(?:-?[\d.]+(?:em|%)|env\(|var\(--(?!space-)|var\(--space-[\w-]+,)/.test(part),
    )
  ) {
    return true
  }
  const scale = readSpaceScalePx()
  const operands = parts.map((part) => {
    const token = /^var\((--[\w-]+)\)$/.exec(part)?.[1]
    return token === undefined ? part : String(scale[token] ?? Number.NaN)
  })
  const value = evaluate(operands)
  return !Number.isNaN(value) && [0, ...Object.values(scale)].includes(Math.abs(value))
}

function evaluate(tokens: readonly string[]): number {
  const terms = tokens.reduce<readonly string[][]>(
    (groups, token) =>
      /^[+-]$/.test(token)
        ? [...groups, [token], []]
        : [...groups.slice(0, -1), [...(groups.at(-1) ?? []), token]],
    [[]],
  )
  return terms.reduce<number>((sum, group, index) => {
    if (index === 0) return product(group)
    return index % 2 === 0 ? sum + (terms[index - 1]?.[0] === "-" ? -1 : 1) * product(group) : sum
  }, 0)
}

function product(factors: readonly string[]): number {
  return factors.reduce<number>((acc, token, index) => {
    if (index === 0) return Number(token)
    return token === "*" || token === "/"
      ? acc
      : acc * (factors[index - 1] === "/" ? 1 / Number(token) : Number(token))
  }, 1)
}

function splitTopLevel(value: string, separator: RegExp): readonly string[] {
  const { parts, current } = [...value.trim()].reduce<{
    readonly parts: readonly string[]
    readonly current: string
    readonly depth: number
  }>(
    (state, char) => {
      const depth = state.depth + (char === "(" ? 1 : char === ")" ? -1 : 0)
      if (depth === 0 && char !== ")" && separator.test(char)) {
        return {
          parts: state.current === "" ? state.parts : [...state.parts, state.current],
          current: "",
          depth,
        }
      }
      return { ...state, current: state.current + char, depth }
    },
    { parts: [], current: "", depth: 0 },
  )
  return current === "" ? parts : [...parts, current]
}
