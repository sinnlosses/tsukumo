// 文書（`.md`）が、バッククォートで囲んで `test/`・`scripts/`・`src/` のファイルをパスで指している
// 書き方を拾う純粋関数。ファイルの実在を照らすのは `collectMissingSourcePathReferences`。
//
// 拾うのは、バッククォートで囲まれ、`test/`・`scripts/`・`src/` で始まり、拡張子
// （`.ts`・`.tsx`・`.md`・`.json`・`.css`・`.sh`）で終わるパス。後ろの `:行`・`:行-行`・`#…` は落として照らす。
// `*`・`<`・`{`・`$`・`…` を含むものは見本なので拾わない。ファイル名だけの書き方とリンクは拾わない。

import type { FileReference } from "./section-reference.ts"

const SOURCE_PATH =
  /`((?:test|scripts|src)\/[^`\s*<{$…:#]*\.(?:ts|tsx|md|json|css|sh))(?::\d+(?:-\d+)?|#[^`\s]*)?`/gu

// 照らさない文書（旧い TUI 時代の設計を残す記録。パスの完全一致）。
const UNCHECKED_DOCUMENTS = new Set<string>([
  "docs/architecture/adr/0016-html-instead-of-terminal.md",
])

// 照らさない素のパス（書き方の見本として使う架空のパスの完全一致）。
const UNCHECKED_PATHS = new Set<string>(["src/foo.ts"])

/** 文書1つの本文から、`test/`・`scripts/`・`src/` のファイルを指すパスをすべて拾う。 */
export function findSourcePathReferences(sourcePath: string, text: string): FileReference[] {
  if (!sourcePath.endsWith(".md") || UNCHECKED_DOCUMENTS.has(sourcePath)) {
    return []
  }
  return text.split("\n").flatMap((lineText, index) =>
    [...lineText.matchAll(SOURCE_PATH)]
      .flatMap((match) => (match[1] === undefined ? [] : [match[1]]))
      .filter((targetPath) => !UNCHECKED_PATHS.has(targetPath))
      .map((targetPath) => ({ sourcePath, line: index + 1, targetPath })),
  )
}
