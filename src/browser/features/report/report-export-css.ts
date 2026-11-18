// 書き出す写しに当たる CSS の規則を、文書に読み込まれた規則（`document.styleSheets`）から集めて1つの文字列にする。
// CSS Modules の class は名前にハッシュが焼かれるので、書き出し用の CSS を別に持たず、画面に効いている規則をそのまま写す。
// 入れ子の規則は親の選択子を `:is()` で前に足して平らにし、`@media`・`@container` などの包みは中に当たる規則があるときだけ残す。

import { escapeRegExp } from "../../../shared/utils/escape-regexp.ts"

/** 写しの要素に当たる規則と、それらが参照する custom property・`@keyframes`・`@property` の文字列。 */
export function reportExportCss(copy: Element, document: Document): string {
  const rules = [...document.styleSheets].flatMap((sheet) =>
    collectRules(readRules(sheet), copy, ROOT_SCOPE),
  )
  const matched = rules.flatMap((rule) => (rule.kind === "matched" ? [rule.text] : []))
  const namedRules = rules.flatMap((rule) => (rule.kind === "named" ? [rule] : []))
  const used = matched.join("\n")
  const referenced = namedRules
    .filter((rule) => new RegExp(`(^|[^\\w-])${escapeRegExp(rule.name)}($|[^\\w-])`).test(used))
    .map((rule) => rule.text)
  // 写しの style 属性・SVG の属性・図の中の style 要素も custom property を参照する
  const tokens = customPropertyBlock(`${used}\n${copy.outerHTML}`, document)
  return [tokens, ...referenced, ...matched].filter((text) => text !== "").join("\n")
}

type CollectedRule =
  | { readonly kind: "matched"; readonly text: string }
  | { readonly kind: "named"; readonly name: string; readonly text: string }

/** 入れ子の外側の選択子。最上位は親を持たない。 */
type Scope = { readonly kind: "root" } | { readonly kind: "nested"; readonly selector: string }

const ROOT_SCOPE: Scope = { kind: "root" }

/** 名前で参照されたときだけ写す規則の頭。`@font-face` は画面の配る経路を指す URL なので写さない。 */
const NAMED_AT_RULE = /^@(keyframes|property)\s+([^\s{]+)/

/** 要素の有無に関わらない擬似要素と、操作のあいだだけ当たる擬似クラス。選択子を写しに当てるときだけ外す。 */
const UNMATCHABLE_PSEUDO =
  /::[\w-]+(\([^)]*\))?|:(before|after|first-line|first-letter|hover|focus|focus-visible|focus-within|active|visited|target)(?![\w-])/g

function collectRules(rules: readonly CSSRule[], copy: Element, scope: Scope): CollectedRule[] {
  return rules.flatMap((rule): CollectedRule[] => {
    if (rule instanceof CSSStyleRule) {
      return styleRule(rule, copy, scope)
    }
    if (isImportRule(rule)) {
      return rule.styleSheet === null ? [] : collectRules(readRules(rule.styleSheet), copy, scope)
    }
    const named = NAMED_AT_RULE.exec(rule.cssText)
    if (named?.[2] !== undefined) {
      return scope.kind === "root" ? [{ kind: "named", name: named[2], text: rule.cssText }] : []
    }
    if (isGroupingRule(rule)) {
      return groupingRule(rule, copy, scope)
    }
    if (scope.kind === "nested" && isNestedDeclarations(rule) && rule.style.length > 0) {
      return [{ kind: "matched", text: `${scope.selector} { ${rule.style.cssText} }` }]
    }
    return []
  })
}

function styleRule(rule: CSSStyleRule, copy: Element, scope: Scope): CollectedRule[] {
  const selector = resolvedSelector(rule.selectorText, scope)
  if (!matchesCopy(copy, selector)) {
    return []
  }
  const own: CollectedRule[] =
    rule.style.length > 0
      ? [{ kind: "matched", text: `${selector} { ${rule.style.cssText} }` }]
      : []
  const nested = collectRules(readRules(rule), copy, { kind: "nested", selector })
  return [...own, ...nested]
}

/** `@media`・`@container`・`@supports`・`@layer` の包み。中に写す規則があるときだけ、頭をそのまま付けて残す。 */
function groupingRule(
  rule: CSSRule & { readonly cssRules: CSSRuleList },
  copy: Element,
  scope: Scope,
): CollectedRule[] {
  const inner = collectRules(readRules(rule), copy, scope)
  const matched = inner.flatMap((entry) => (entry.kind === "matched" ? [entry.text] : []))
  const named = inner.filter((entry) => entry.kind === "named")
  if (matched.length === 0) {
    return named
  }
  const head = rule.cssText.slice(0, rule.cssText.indexOf("{")).trim()
  return [...named, { kind: "matched", text: `${head} {\n${matched.join("\n")}\n}` }]
}

/** 入れ子の選択子を、親の選択子を前に足した最上位の選択子にする。`&` があればそこへ親を入れる。 */
function resolvedSelector(selectorText: string, scope: Scope): string {
  if (scope.kind === "root") {
    return selectorText
  }
  const parent = `:is(${scope.selector})`
  return splitSelectorList(selectorText)
    .map((part) => (part.includes("&") ? part.replaceAll("&", parent) : `${parent} ${part}`))
    .join(", ")
}

/** 写しの根かその中のどれかに当たるか。当てられない選択子は、落とすより写すほうを選ぶ。 */
function matchesCopy(copy: Element, selector: string): boolean {
  const probe = selector.replace(UNMATCHABLE_PSEUDO, "")
  try {
    return copy.matches(probe) || copy.querySelector(probe) !== null
  } catch {
    // 擬似クラスを外して形が崩れた選択子は当否を測れないので、落とさずに写す
    return true
  }
}

/** 写しの規則が参照する custom property を、文書の根で効いている値で `:root` に並べる。値の中の参照もたどる。 */
function customPropertyBlock(used: string, document: Document): string {
  const computed = document.defaultView?.getComputedStyle(document.documentElement)
  if (computed === undefined) {
    return ""
  }
  const values = new Map<string, string>()
  const pending = [...referencedCustomProperties(used)]
  for (let name = pending.shift(); name !== undefined; name = pending.shift()) {
    if (values.has(name)) {
      continue
    }
    const value = computed.getPropertyValue(name).trim()
    values.set(name, value)
    pending.push(...referencedCustomProperties(value))
  }
  const declarations = [...values]
    .filter(([, value]) => value !== "")
    .map(([name, value]) => `${name}: ${value};`)
  return declarations.length === 0 ? "" : `:root { ${declarations.join(" ")} }`
}

function referencedCustomProperties(text: string): readonly string[] {
  return [...text.matchAll(/var\(\s*(--[\w-]+)/g)].flatMap((match) =>
    match[1] === undefined ? [] : [match[1]],
  )
}

/** 別の origin から読んだ規則は読めない（`cssRules` が投げる）ので、無いものとして扱う。 */
function readRules(holder: { readonly cssRules: CSSRuleList }): readonly CSSRule[] {
  try {
    return [...holder.cssRules]
  } catch {
    // 別の origin の規則表は画面のレポートに当たらないので、写さなくてよい
    return []
  }
}

/** `@import`。happy-dom は `CSSImportRule` を持たないので、形で見分ける。 */
function isImportRule(rule: CSSRule): rule is CSSRule & {
  readonly styleSheet: CSSStyleSheet | null
} {
  return "styleSheet" in rule && rule.cssText.startsWith("@import")
}

function isGroupingRule(rule: CSSRule): rule is CSSRule & { readonly cssRules: CSSRuleList } {
  return "cssRules" in rule && rule.cssRules instanceof Object && rule.cssText.startsWith("@")
}

/** 入れ子の包みの中に直接書いた宣言（`CSSNestedDeclarations`）。選択子を持たず、外側の選択子に当たる。 */
function isNestedDeclarations(
  rule: CSSRule,
): rule is CSSRule & { readonly style: CSSStyleDeclaration } {
  return "style" in rule && rule.style instanceof Object && !("selectorText" in rule)
}

/** 括弧の外のカンマで選択子の並びを分ける。 */
function splitSelectorList(selectorText: string): readonly string[] {
  const parts: string[] = []
  let depth = 0
  let start = 0
  for (let index = 0; index < selectorText.length; index += 1) {
    const char = selectorText[index]
    if (char === "(") depth += 1
    if (char === ")") depth -= 1
    if (char === "," && depth === 0) {
      parts.push(selectorText.slice(start, index).trim())
      start = index + 1
    }
  }
  parts.push(selectorText.slice(start).trim())
  return parts
}
