import { existsSync, readdirSync, readFileSync, statSync } from "node:fs"

import { uniqueBy } from "remeda"
import { describe, expect, it } from "vitest"

import { commentLineIndexes } from "../comment-line.ts"
import { listSourceFiles, resolveRelativeImport, SRC_ROOT } from "./source-file.ts"

const HEX_COLOR = /#[0-9a-fA-F]{3,8}\b/

describe("16進の色", () => {
  it("src/browser/ の *.css で、theme.css 以外のコメント行でない行に16進の色が無い", () => {
    const offenders = listSourceFiles(SRC_ROOT, SRC_ROOT, [".css"])
      .filter((relPath) => relPath.startsWith("browser/") && relPath !== "browser/styles/theme.css")
      .flatMap((relPath) => {
        const lines = readFileSync(`${SRC_ROOT}/${relPath}`, "utf8").split("\n")
        const commentLines = new Set(commentLineIndexes(lines))
        return lines.flatMap((line, index) =>
          !commentLines.has(index) && HEX_COLOR.test(line) ? [`src/${relPath}:${index + 1}`] : [],
        )
      })

    expect(offenders.join("\n")).toBe("")
  })
})

// `components/ui/` の variant 部品（`Select` 以外）に渡す `className` の作法を検査で守る
// （`docs/architecture/browser.md`「`components/ui/` の部品（variant の作法と一覧）」の「呼び出し側からの
// 上書き（className）」節「検査で守る」）。(1) 呼び出し側が渡す `className` の式が
// CSS Modules の字面（`.module.css` を import した名前での `styles["…"]` / `<箱の名前>Styles["…"]`）と、
// `??`・テンプレート文字列での組み合わせだけでできていること、
// (2) その class の CSS 規則（その名前で import した `*.module.css` で、選択子の最後の複合にその class を
// 含むもの。`::` の疑似要素は別の持ち物として数え、対象にしない）の property が、部品の CSS で
// `:where()` の外に書いた property と重ならないことを見る。
//
// 対象は動的に決める（`readonly className: string` を持つ `components/ui/` の部品。`Select` は
// 作法の例外として名指しで外す）。自分の CSS を持たない薄い部品（`VStack` / `HStack`）は、
// レンダーする先の部品（`Stack`）の CSS を辿って「持ち物」を決める——渡した class がそのまま
// 同じ DOM ノードに乗るため。

const CLASSNAME_PROP_PATTERN = /readonly className: string/
const UI_COMPONENT_FILE_PATTERN = /^browser\/components\/ui\/([^/]+)\/\1\.tsx$/

/** `.module.css` を import した名前と、その CSS の `src/` 相対パスの対応。 */
type CssModuleImports = ReadonlyMap<string, string>

/** この `.tsx` が `.module.css` を import した名前（`styles` / `taskBoardStyles` など）ごとに、CSS のパスを解く。 */
function cssModuleImports(content: string, fromRelPath: string): CssModuleImports {
  return new Map(
    [...content.matchAll(/import\s+(\w+)\s+from\s+["'](\.[^"']+\.module\.css)["']/g)].flatMap(
      ([, name, specifier]): [string, string][] =>
        name === undefined || specifier === undefined
          ? []
          : [[name, resolveRelativeImport(fromRelPath, specifier)]],
    ),
  )
}

/** `<import した名前>["…"]` / `<import した名前>['…']` の字面だけを拾う。1つ目の捕獲が名前、2つ目か3つ目が class 名。 */
function cssModuleLiteralPattern(imports: CssModuleImports): RegExp | undefined {
  const names = [...imports.keys()]
  return names.length === 0
    ? undefined
    : new RegExp(`\\b(${names.join("|")})\\[(?:"([\\w-]+)"|'([\\w-]+)')\\]`, "g")
}

/**
 * `className` の式が「CSS Modules の字面と、`??`・テンプレート文字列での組み合わせ」だけで
 * できているか。値を足すのは使う箇所が出たときだけにし、ここもいまの用途（字面1つ・`??` での
 * 既定値・テンプレート文字列での連結）だけを許す。三項演算子の条件のように任意の式が混じる形は、
 * 使う箇所が出たら合わせて広げる。
 */
function isAllowedClassNameExpression(expr: string, imports: CssModuleImports): boolean {
  const pattern = cssModuleLiteralPattern(imports)
  const withoutLiterals = pattern === undefined ? expr : expr.replace(pattern, "")
  return /^[\s`$(){}?:."']*$/.test(withoutLiterals.replace(/\?\?/g, ""))
}

/** 式の中の CSS Modules の字面が引く class を、その CSS のパスと組にしてすべて拾う（重複を畳む）。 */
function classNamesInExpression(
  expr: string,
  imports: CssModuleImports,
): readonly { readonly cssRelPath: string; readonly className: string }[] {
  const pattern = cssModuleLiteralPattern(imports)
  if (pattern === undefined) {
    return []
  }
  const pairs = [...expr.matchAll(pattern)].flatMap(([, name, a, b]) => {
    const cssRelPath = name === undefined ? undefined : imports.get(name)
    const className = a ?? b
    return cssRelPath === undefined || className === undefined ? [] : [{ cssRelPath, className }]
  })
  return uniqueBy(pairs, ({ cssRelPath, className }) => `${cssRelPath}\0${className}`)
}

/** ディレクトリ名（kebab-case）から、そこに置く部品の PascalCase の名前を作る。 */
function pascalCaseOf(dirName: string): string {
  return dirName
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join("")
}

/**
 * `readonly className: string` を持つ `components/ui/` の部品（`Select` を除く）の一覧。
 * 自分の CSS を持たない薄い部品（`VStack` / `HStack`）は、`Omit<StackProps, "direction">` の
 * ように型を経由するので、本文に `readonly className: string` の字面が無い。 レンダーする先
 * （`.tsx` の `return <部品名`）を辿り、その先が対象ならこちらも対象に加える（固定点まで
 * 繰り返し、転送が連なっても拾う）。
 */
function classNameCheckedUiComponents(): readonly {
  readonly dirName: string
  readonly name: string
}[] {
  const entries = listSourceFiles(SRC_ROOT)
    .flatMap((relPath) => {
      const match = UI_COMPONENT_FILE_PATTERN.exec(relPath)
      return match?.[1] !== undefined ? [{ relPath, dirName: match[1] }] : []
    })
    .filter(({ dirName }) => dirName !== "select")
    .map(({ relPath, dirName }) => ({
      dirName,
      name: pascalCaseOf(dirName),
      content: readFileSync(`${SRC_ROOT}/${relPath}`, "utf8"),
    }))

  const checked = new Set(
    entries.filter(({ content }) => CLASSNAME_PROP_PATTERN.test(content)).map((e) => e.dirName),
  )
  for (let grown = true; grown;) {
    grown = false
    for (const entry of entries) {
      if (checked.has(entry.dirName)) {
        continue
      }
      const renderedName = /return\s*<([A-Z]\w*)\b/.exec(entry.content)?.[1]
      const renderedDirName = entries.find((e) => e.name === renderedName)?.dirName
      if (renderedDirName !== undefined && checked.has(renderedDirName)) {
        checked.add(entry.dirName)
        grown = true
      }
    }
  }

  return entries
    .filter((e) => checked.has(e.dirName))
    .map(({ dirName, name }) => ({ dirName, name }))
}

type CssRule = {
  readonly selectors: readonly string[]
  readonly properties: readonly string[]
}

/**
 * CSS の宣言ブロックを（ネストも含めて）1件ずつ切り出す。`@media` など宣言以外の入れ物は、
 * 中に `{` を持つので除く。 */
function cssRules(content: string): readonly CssRule[] {
  const withoutComments = content.replace(/\/\*[\s\S]*?\*\//g, "")
  const rules: CssRule[] = []
  const stack: { readonly selectorStart: number; readonly bodyStart: number }[] = []
  let cursor = 0
  for (let i = 0; i < withoutComments.length; i++) {
    const ch = withoutComments[i]
    if (ch === "{") {
      stack.push({ selectorStart: cursor, bodyStart: i + 1 })
      cursor = i + 1
    } else if (ch === "}") {
      const frame = stack.pop()
      if (frame !== undefined) {
        const selectorText = withoutComments.slice(frame.selectorStart, frame.bodyStart - 1)
        const bodyText = withoutComments.slice(frame.bodyStart, i)
        if (!bodyText.includes("{") && !selectorText.trim().startsWith("@")) {
          rules.push({
            selectors: selectorText
              .split(",")
              .map((s) => s.trim())
              .filter((s) => s.length > 0),
            properties: declaredProperties(bodyText),
          })
        }
      }
      cursor = i + 1
    }
  }
  return rules
}

/** 一括指定を、比べる先で使う個々の property に開く（開かないものは字面のまま返す）。 */
const SHORTHAND_LONGHAND: Readonly<Record<string, readonly string[]>> = {
  margin: ["margin-top", "margin-right", "margin-bottom", "margin-left"],
  padding: ["padding-top", "padding-right", "padding-bottom", "padding-left"],
  border: ["border-color", "border-width", "border-style"],
  "border-top": ["border-top-color", "border-top-width", "border-top-style"],
  "border-right": ["border-right-color", "border-right-width", "border-right-style"],
  "border-bottom": ["border-bottom-color", "border-bottom-width", "border-bottom-style"],
  "border-left": ["border-left-color", "border-left-width", "border-left-style"],
  background: [
    "background-color",
    "background-image",
    "background-position",
    "background-size",
    "background-repeat",
  ],
  flex: ["flex-grow", "flex-shrink", "flex-basis"],
  gap: ["row-gap", "column-gap"],
  inset: ["top", "right", "bottom", "left"],
  font: ["font-style", "font-weight", "font-size", "line-height", "font-family"],
}

function declaredProperties(bodyText: string): readonly string[] {
  const names = bodyText
    .split(";")
    .map((decl) => decl.split(":")[0]?.trim() ?? "")
    .filter((name) => name.length > 0 && !name.startsWith("--"))
  return names.flatMap((name) => SHORTHAND_LONGHAND[name] ?? [name])
}

/**
 * 選択子の最後の複合（最後の結合子より後ろ）が、その class を持つか。`::` の疑似要素は
 * 別の持ち物として数えるので対象にしない。 */
function lastCompoundHasClass(selector: string, className: string): boolean {
  const trimmed = selector.trim()
  if (trimmed.includes("::")) {
    return false
  }
  const compounds = trimmed
    .split(/\s+|(?=[>+~])|(?<=[>+~])/)
    .filter((part) => part.trim().length > 0)
  const last = compounds[compounds.length - 1]
  return last !== undefined && new RegExp(`\\.${className}(?=[.:#[]|$)`).test(last)
}

/** その class を最後の複合に持つ規則ぜんぶの property（重複を畳む）。 */
function propertiesOfClass(cssContent: string, className: string): readonly string[] {
  return [
    ...new Set(
      cssRules(cssContent).flatMap((rule) =>
        rule.selectors.some((selector) => lastCompoundHasClass(selector, className))
          ? rule.properties
          : [],
      ),
    ),
  ]
}

/**
 * 部品が `:where()` の外に持つ property（呼び出し側の class と競ってはいけないもの）。
 * 自分の CSS を持たない部品（`VStack` / `HStack`）は、レンダーする先の部品名を `.tsx` から辿って
 * その CSS を見る（同じ DOM ノードに乗るため。`visited` は辿りが循環しないための歯止め）。
 * `::backdrop` などの疑似要素の規則は別の持ち物として数え、ここには含めない
 * （`docs/architecture/browser.md`「`components/ui/` の部品」の検査の注記。別の要素に描くので、呼び出し側の
 * class が同じ property 名を持っていても競らない）。
 */
function ownExternalProperties(
  dirName: string,
  visited: ReadonlySet<string> = new Set(),
): readonly string[] {
  if (visited.has(dirName)) {
    return []
  }
  const cssRelPath = `browser/components/ui/${dirName}/${dirName}.module.css`
  const tsxRelPath = `browser/components/ui/${dirName}/${dirName}.tsx`
  if (existsSync(`${SRC_ROOT}/${cssRelPath}`)) {
    const cssContent = readFileSync(`${SRC_ROOT}/${cssRelPath}`, "utf8")
    return [
      ...new Set(
        cssRules(cssContent)
          .filter((rule) =>
            rule.selectors.every(
              (selector) => !selector.trim().startsWith(":where(") && !selector.includes("::"),
            ),
          )
          .flatMap((rule) => rule.properties),
      ),
    ]
  }
  if (!existsSync(`${SRC_ROOT}/${tsxRelPath}`)) {
    return []
  }
  const tsxContent = readFileSync(`${SRC_ROOT}/${tsxRelPath}`, "utf8")
  const renderedTagMatch = /return\s*<([A-Z]\w*)\b/.exec(tsxContent)
  const renderedDirName = classNameCheckedUiComponents().find(
    (c) => c.name === renderedTagMatch?.[1],
  )?.dirName
  return renderedDirName === undefined
    ? []
    : ownExternalProperties(renderedDirName, new Set([...visited, dirName]))
}

/** `.tsx` のソースから、`<部品名 ... className={式} ...>` の使用箇所をすべて拾う。 */
function jsxUsagesWithClassName(
  content: string,
  componentName: string,
): readonly { readonly tagText: string; readonly classNameExpr: string }[] {
  const tagPattern = new RegExp(`<${componentName}(?=[\\s/>])`, "g")
  const usages: { tagText: string; classNameExpr: string }[] = []
  for (const match of content.matchAll(tagPattern)) {
    const start = match.index
    let depth = 0
    let end = start
    for (let i = start; i < content.length; i++) {
      const ch = content[i]
      if (ch === "{") {
        depth++
      } else if (ch === "}") {
        depth--
      } else if (ch === ">" && depth === 0) {
        end = i + 1
        break
      }
    }
    const tagText = content.slice(start, end)
    const classNameStart = tagText.indexOf("className={")
    if (classNameStart === -1) {
      continue
    }
    let exprDepth = 1
    let exprEnd = classNameStart + "className={".length
    for (; exprEnd < tagText.length; exprEnd++) {
      const ch = tagText[exprEnd]
      if (ch === "{") {
        exprDepth++
      } else if (ch === "}") {
        exprDepth--
        if (exprDepth === 0) {
          break
        }
      }
    }
    usages.push({
      tagText,
      classNameExpr: tagText.slice(classNameStart + "className={".length, exprEnd),
    })
  }
  return usages
}

describe("components/ui/ の部品の className", () => {
  it('渡す className は styles["…"] の組み合わせだけで、その class は部品の property と重ならない', () => {
    const targets = classNameCheckedUiComponents()
    expect(targets.length).toBeGreaterThan(0)

    const files = listSourceFiles(SRC_ROOT).filter(
      (relPath) => relPath.startsWith("browser/") && relPath.endsWith(".tsx"),
    )

    const targetOwnProperties = new Map(
      targets.map(({ dirName }) => [dirName, new Set(ownExternalProperties(dirName))]),
    )
    const cssContentCache = new Map<string, string>()
    const cssContentOf = (cssRelPath: string): string => {
      const cached = cssContentCache.get(cssRelPath)
      if (cached !== undefined) {
        return cached
      }
      const content = readFileSync(`${SRC_ROOT}/${cssRelPath}`, "utf8")
      cssContentCache.set(cssRelPath, content)
      return content
    }

    const offenders = files.flatMap((relPath) => {
      const content = readFileSync(`${SRC_ROOT}/${relPath}`, "utf8")
      return targets.flatMap(({ dirName, name }) => {
        const ownProperties = targetOwnProperties.get(dirName) ?? new Set<string>()
        const imports = cssModuleImports(content, relPath)
        return jsxUsagesWithClassName(content, name).flatMap(({ classNameExpr }) => {
          if (!isAllowedClassNameExpression(classNameExpr, imports)) {
            return [
              `src/${relPath}: <${name}> の className が CSS Modules の字面の組み合わせだけでできていない（${classNameExpr}）`,
            ]
          }
          return classNamesInExpression(classNameExpr, imports).flatMap(
            ({ cssRelPath, className }) => {
              const overlap = propertiesOfClass(cssContentOf(cssRelPath), className).filter(
                (property) => ownProperties.has(property),
              )
              return overlap.length > 0
                ? [
                    `src/${relPath}: <${name}> に渡す ${className} が部品の property と重なる（${overlap.join(", ")}）`,
                  ]
                : []
            },
          )
        })
      })
    })

    expect(offenders.join("\n")).toBe("")
  })
})

describe("CSS Modules の class", () => {
  it("CSS Modules のセレクタに書いた class は、tsx から styles で参照されているか、許可リストにある", () => {
    const cssFiles = listFiles(SRC_ROOT).filter((relPath) => relPath.endsWith(".module.css"))
    expect(cssFiles.length).toBeGreaterThan(0)

    const readersByCss = new Map<string, readonly string[]>()
    for (const relPath of listSourceFiles(SRC_ROOT)) {
      const content = readFileSync(`${SRC_ROOT}/${relPath}`, "utf8")
      for (const importMatch of content.matchAll(
        /import\s+\w+\s+from\s+["'](\.[^"']+\.module\.css)["']/g,
      )) {
        const cssRelPath = resolveRelativeImport(relPath, importMatch[1] ?? "")
        readersByCss.set(cssRelPath, [...(readersByCss.get(cssRelPath) ?? []), content])
      }
    }

    const offenders = cssFiles.flatMap((cssRelPath) => {
      const readers = readersByCss.get(cssRelPath) ?? []
      return cssClassNames(readFileSync(`${SRC_ROOT}/${cssRelPath}`, "utf8"))
        .filter(
          (className) =>
            !readers.some((content) => isCssClassReferenced(content, className)) &&
            !FOREIGN_CSS_CLASS_PREFIXES.some((prefix) => className.startsWith(prefix)),
        )
        .map((className) => `src/${cssRelPath}: .${className} がどの tsx からも参照されていない`)
    })

    expect(offenders.join("\n")).toBe("")
  })
})

/**
 * 読み手のソースに、class 名が文字列として現れるか。`styles[\`prefix-${x}\`]` のように
 * 後ろを組み立てる綴りは、接頭辞までの一致で参照とみなす。
 */
function isCssClassReferenced(content: string, className: string): boolean {
  if (content.includes(`"${className}"`) || content.includes(`.${className}`)) {
    return true
  }
  return [...content.matchAll(/`([\w-]+)\$\{/g)].some((match) =>
    className.startsWith(match[1] ?? "\0"),
  )
}

// tsx 以外（rehype・CodeMirror）が付ける class と、domain/reveal が生の class 名で選ぶために
// styles を介さず literal で付ける class の接頭辞。
const FOREIGN_CSS_CLASS_PREFIXES = ["report-", "cm-", "chart-block"] as const

/** CSS のセレクタ部分（`{` の前）に現れる class 名。コメントと宣言の中身は見ない。 */
function cssClassNames(content: string): readonly string[] {
  const withoutComments = content.replace(/\/\*[\s\S]*?\*\//g, "")
  const preludes = [...withoutComments.matchAll(/([^{};]+)\{/g)].map((match) => match[1] ?? "")
  return [
    ...new Set(
      preludes.flatMap((prelude) =>
        [...prelude.matchAll(/\.([A-Za-z_][\w-]*)/g)].map((match) => match[1] ?? ""),
      ),
    ),
  ]
}

/** `src/` の下のファイルすべて（拡張子を問わない）。 */
function listFiles(root: string, dir = root): readonly string[] {
  return readdirSync(dir).flatMap((name) => {
    const fullPath = `${dir}/${name}`
    return statSync(fullPath).isDirectory()
      ? listFiles(root, fullPath)
      : [fullPath.slice(root.length + 1)]
  })
}
