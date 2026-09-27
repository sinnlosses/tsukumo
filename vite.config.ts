// ブラウザ側（`src/browser/`）を組み立てる設定。
// 組み立てを起こす口は `bundleWithVite` だけで、
// 入口の置き場（root）と出し先（outDir）は起こす側が CLI の引数で渡す。
//
// 出す名前は `main.js` と `main.css` に固定する。
// `readPair` はこの2つの名前で読み、ハッシュ付きの名前は読まない。

import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"

export default defineConfig({
  plugins: [react()],
  publicDir: false,
  logLevel: "warn",
  // 型だけを取り出す import（`import { type Element } from "hast"`）を、読み込みごと消す。
  // tsconfig の `verbatimModuleSyntax` のままだと `import "hast"` が残り、
  // 型しか持たないパッケージを解決できずに組み立てが止まる。
  oxc: { typescript: { onlyRemoveTypeImports: false } },
  build: {
    emptyOutDir: true,
    minify: false,
    modulePreload: false,
    cssCodeSplit: false,
    reportCompressedSize: false,
    rolldownOptions: {
      input: "main.tsx",
      output: {
        entryFileNames: "main.js",
        assetFileNames: "main[extname]",
      },
    },
  },
})
