/** CSS のセレクタ部分（`{` の前）に現れる class 名。コメントと宣言の中身は見ない。 */
export function cssClassNames(content: string): readonly string[] {
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
