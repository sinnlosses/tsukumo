// `persona.md` を、人が書く本文と、末尾の機械が書き足す節（`## 覚えたこと`）に分ける。
// 画面から直せるのは本文だけで、節は書く瞬間のファイルのものをそのまま残す。
// 分け目はここの1か所に決め、覚えたことを書き足す側と本文を書く側が同じ位置を見る。

/** 書き足す節の見出し。`persona.md` のいちばん最後に置く。 */
export const REMEMBERED_SECTION_HEADING = "## 覚えたこと"

/** 画面から書けるペルソナの長さの上限（文字数）。 */
export const MAX_PERSONA_BODY_LENGTH = 8000

/** 節より前の本文。節が無ければ全文。末尾の空白は落とす。 */
export function personaBody(content: string): string {
  const start = rememberedSectionStart(content)
  return (start === undefined ? content : content.slice(0, start)).trimEnd()
}

/**
 * 本文を `body` に差し替えた `persona.md` の全文。
 * `content` の節は1バイトも変えずに末尾へ付け直す（節が無ければ本文だけ。本文が空なら節だけ）。
 */
export function personaWithBody(content: string, body: string): string {
  const start = rememberedSectionStart(content)
  const section = start === undefined ? "" : content.slice(start)
  const trimmed = body.trimEnd()
  const head = trimmed === "" ? "" : `${trimmed}\n`
  return head === "" || section === "" ? `${head}${section}` : `${head}\n${section}`
}

/**
 * 節の見出しが始まる位置（無ければ undefined）。
 * 見出しは最後のものを見る。節はいちばん最後に置くので、そこから末尾までが機械の書いた領域になる。
 */
export function rememberedSectionStart(content: string): number | undefined {
  const marker = `\n${REMEMBERED_SECTION_HEADING}`
  for (let at = content.lastIndexOf(marker); at >= 0; at = content.lastIndexOf(marker, at - 1)) {
    if (isHeadingLine(content, at + 1)) {
      return at + 1
    }
  }

  return isHeadingLine(content, 0) ? 0 : undefined
}

/** その位置から見出しの1行がちょうど始まっているか（`## 覚えたことメモ` のような行は別物）。 */
function isHeadingLine(content: string, at: number): boolean {
  if (!content.startsWith(REMEMBERED_SECTION_HEADING, at)) {
    return false
  }

  const next = content.charAt(at + REMEMBERED_SECTION_HEADING.length)
  return next === "" || next === "\n" || next === "\r"
}
