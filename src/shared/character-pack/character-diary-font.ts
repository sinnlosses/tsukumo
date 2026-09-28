// 日記の本文に効かせる書体（`character.json` の `diaryFont`）。
// キャラクターパックに同梱した書体ファイルだけを配ってよい。
// ここが持つのはファイル名として受け付けてよい形の検証と、配るときの MIME タイプだけ。
// 画面から差し替える口は無い（手で `character.json` と書体ファイルをパックに置く）ので、data URL の受け取りやファイル名の組み立ては持たない。

/** 受け付ける書体の形式。ファイル名の拡張子にもそのまま使う。 */
export type DiaryFontFormat = "woff2" | "woff" | "ttf" | "otf"

/**
 * 日記の書体として扱ってよいファイル名か。
 *
 * - 使えるのは半角英数字と `.` `_` `-` だけ（パスの区切り・空白・引用符が入らないので、ディレクトリを跨ぐ名前にも、CSS の `url()` を抜け出す名前にもならない）
 * - 拡張子は `.woff2` / `.woff` / `.ttf` / `.otf` のどれか
 */
export function isDiaryFontFileName(name: string): boolean {
  return (
    DIARY_FONT_FILE_NAME_PATTERN.test(name) &&
    DIARY_FONT_FILE_EXTENSIONS.some((extension) => name.toLowerCase().endsWith(extension))
  )
}

/**
 * 配るときの `Content-Type`。拡張子だけで仕分ける。
 * 知らない拡張子は undefined（{@link isDiaryFontFileName} を通っていないファイル名を渡さない前提）。
 */
export function diaryFontMimeType(name: string): string | undefined {
  const extension = DIARY_FONT_FILE_EXTENSIONS.find((candidate) =>
    name.toLowerCase().endsWith(candidate),
  )
  return extension === undefined ? undefined : DIARY_FONT_MIME_BY_EXTENSION[extension]
}

const DIARY_FONT_FILE_NAME_PATTERN = /^[A-Za-z0-9._-]+$/

const DIARY_FONT_FILE_EXTENSIONS = [".woff2", ".woff", ".ttf", ".otf"] as const

const DIARY_FONT_MIME_BY_EXTENSION: Readonly<Record<string, string>> = {
  ".woff2": "font/woff2",
  ".woff": "font/woff",
  ".ttf": "font/ttf",
  ".otf": "font/otf",
}
