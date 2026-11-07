// 節の見出しの字を、Markdown の描画を通さずに h4 の子へ素の字で出してよいか。
// Markdown が行内で読み替えうる字（行内の印 `{{…}}`・自動リンクの `:` `/` `.` `@`・強調・コード・閉じの `#` など）は、許す字の外に置く。
// 許す字だけで書かれた見出しは、Markdown に通しても素の字のままになる。

const PLAIN_HEADING = /^[\p{L}\p{N}\p{M} 、。・「」『』（）()！？!?，：；]+$/u

export function isPlainHeadingText(text: string): boolean {
  return PLAIN_HEADING.test(text)
}
