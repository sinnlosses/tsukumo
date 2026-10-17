/**
 * 出典の札にするリンクか。
 * リンクの字が href のホスト名（先頭の `www.` を除く）と同じなら真。大文字小文字は揃えて比べる。
 * http(s) の絶対 URL でなければ偽。
 */
export function isSourceLink(href: string, text: string): boolean {
  const host = hostWithoutWww(href)
  return (
    host !== undefined &&
    host ===
      text
        .trim()
        .toLowerCase()
        .replace(/^www\./, "")
  )
}

function hostWithoutWww(href: string): string | undefined {
  if (!URL.canParse(href)) {
    return undefined
  }
  const url = new URL(href)
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return undefined
  }
  return url.hostname.replace(/^www\./, "")
}
