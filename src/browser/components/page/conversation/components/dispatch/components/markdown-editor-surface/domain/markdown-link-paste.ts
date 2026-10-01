// 範囲を選んで URL を貼ったときに、選んだ字をリンクの字にする判定。

export type LinkPaste =
  | { readonly kind: "link"; readonly text: string }
  | { readonly kind: "plain" }

export function linkedPaste(selected: string, pasted: string): LinkPaste {
  const url = pasted.trim()
  if (selected === "" || !URL_PATTERN.test(url)) {
    return { kind: "plain" }
  }
  return { kind: "link", text: `[${selected}](${url})` }
}

/** `http://` か `https://` で始まる空白なしの1語。 */
const URL_PATTERN = /^https?:\/\/\S+$/
