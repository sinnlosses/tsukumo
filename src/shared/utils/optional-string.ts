// 「文字列なら返す、それ以外は undefined」の物差し（SDK のイベント・定義ファイル・外来オブジェクトの
// フィールドを境界で検証するときに層をまたいで使う。`src/shared/lib/byte-length.ts` と同じく、
// 複数箇所に散っていた同形のコピーを1つに揃える）。

/** 値が文字列ならそのまま返し、そうでなければ `undefined`。 */
export function optionalString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined
}
