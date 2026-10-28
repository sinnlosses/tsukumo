// デザイントークンの検査が使う、CSS の宣言の読みと、余白・角丸・影・transition の値の判定。

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
  const px = /^([\d.]+)px$/.exec(token)
  if (px !== null) return Number(px[1]) >= 28
  const rem = /^([\d.]+)rem$/.exec(token)
  if (rem !== null) return Number(rem[1]) >= 1.75
  if (token.startsWith("calc(") && token.endsWith(")")) {
    const parts = token.slice(5, -1).match(/var\([^)]*\)|-?[\d.]+[a-z%]*|[-+*/]/g) ?? []
    return parts.every(
      (part) => /^[-+*/]$/.test(part) || /^-?[\d.]+$/.test(part) || isAllowedSpaceToken(part),
    )
  }
  return false
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
