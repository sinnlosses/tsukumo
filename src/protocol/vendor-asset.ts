// 同梱した外部ライブラリ（`vendor/README.md`）を配る経路の名前。**サーバ（core が配る）と
// ブラウザ（ui が `<script src>` に使う）の両方が同じ名前を見る**ので、protocol に置く
// （docs/design.md 4章と同じ考え方。ここは値だけで `node:` にも `document` にも触らない）。
//
// **名前は allowlist の固定の対応表**で、リクエストのパスからファイル名を組み立てない
// （`..` で外へ出る経路を作らない）。

export const VENDOR_PATH_PREFIX = "/vendor/"

/**
 * 配ってよい同梱ファイルと Content-Type。**highlight.min.js と idiomorph.min.js は無い**
 * （移行の段6。コードの色付けは `rehype-highlight` が描く時点で済ませるので実行時に読む
 * スクリプトが要らなくなり、領域の差し替えを DOM の書き換えで行っていた仕組みも消えた。docs/design.md 6.4 / 12章）。
 */
export const VENDOR_ASSET_CONTENT_TYPES: Readonly<Record<string, string>> = {
  "highlight-theme.min.css": "text/css; charset=utf-8",
  "chart.umd.min.js": "text/javascript; charset=utf-8",
  "mermaid.min.js": "text/javascript; charset=utf-8",
}

export function vendorAssetPath(name: string): string {
  return `${VENDOR_PATH_PREFIX}${name}`
}
