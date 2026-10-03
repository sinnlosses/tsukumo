// 外部ライブラリ（npm の依存）を配る経路の名前。
// 名前は allowlist の固定の対応表で、リクエストのパスからファイル名を組み立てない（`..` で外へ出る経路を作らない）。
// その名前が `node_modules` のどのファイルを指すかはサーバの側が持つ。

export const VENDOR_PATH_PREFIX = "/vendor/"

/** 配ってよい同梱ファイルと Content-Type。 */
export const VENDOR_ASSET_CONTENT_TYPES: Readonly<Record<string, string>> = {
  "highlight-theme.min.css": "text/css; charset=utf-8",
  "chart.umd.min.js": "text/javascript; charset=utf-8",
  "mermaid.min.js": "text/javascript; charset=utf-8",
  "ibm-plex-mono-latin-400.woff2": "font/woff2",
  "ibm-plex-mono-latin-600.woff2": "font/woff2",
}

export function vendorAssetPath(name: string): string {
  return `${VENDOR_PATH_PREFIX}${name}`
}
