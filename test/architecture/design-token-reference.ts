// CSS の var(--名) の参照と、--名 の定義（CSS の宣言・TS の style への差し込み）の読み。

const REFERENCE = /var\(\s*(--[\w-]+)\s*\)/g
const CSS_DEFINITION = /(?<![\w-])(--[\w-]+)\s*:/g
const TS_DEFINITION = /["'`](--[\w-]+)["'`]/g

/** 予備値の無い `var(--名)` の名前を集める。 */
export function referencedWithoutFallback(css: string): readonly string[] {
  return [...stripComments(css).matchAll(REFERENCE)].map((match) => match[1] ?? "")
}

export function cssDefinitions(css: string): readonly string[] {
  return [...stripComments(css).matchAll(CSS_DEFINITION)].map((match) => match[1] ?? "")
}

export function tsDefinitions(source: string): readonly string[] {
  return [...source.matchAll(TS_DEFINITION)].map((match) => match[1] ?? "")
}

/** 定義の集合に無い参照を、`ファイル: --名` の組で返す。 */
export function undefinedReferences(
  cssByFile: ReadonlyMap<string, string>,
  definitions: ReadonlySet<string>,
): readonly string[] {
  return [...cssByFile].flatMap(([file, css]) =>
    [...new Set(referencedWithoutFallback(css))]
      .filter((name) => !definitions.has(name))
      .map((name) => `${file}: ${name}`),
  )
}

function stripComments(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, "")
}
