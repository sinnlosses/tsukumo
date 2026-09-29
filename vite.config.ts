// ブラウザ側（`src/browser/`）を組み立てる設定。
// 組み立てを起こす口は `bundleWithVite` だけで、
// 入口の置き場（root）と出し先（outDir）は起こす側が CLI の引数で渡す。
//
// 出す名前は `main.js` と `main.css` に固定する。
// `readPair` はこの2つの名前で読み、ハッシュ付きの名前は読まない。
//
// React Compiler（`oxc-transform-react`）を通し、最適化を諦める部品があれば組み立てを落とす。
// 既定の `panicThreshold` では諦めた部品を黙って素通しし、診断も返さない。
// Vitest の実行には掛からない（`compiler` はブラウザ向けの環境にだけ効く）。
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"

export default defineConfig({
  plugins: [react({ compiler: { panicThreshold: "all_errors" } })],
  publicDir: false,
  logLevel: "warn",
  // 型だけを取り出す import（`import { type Element } from "hast"`）を、読み込みごと消す。
  // tsconfig の `verbatimModuleSyntax` のままだと `import "hast"` が残り、
  // 型しか持たないパッケージを解決できずに組み立てが止まる。
  oxc: { typescript: { onlyRemoveTypeImports: false } },
  // 開発サーバが依存を先に束ねる前の走査は、上の `oxc` を読まずに自分の変換を使う。
  // 同じ指定が無いと `hast` を依存として探し、走査ごと諦める。
  optimizeDeps: {
    rolldownOptions: { transform: { typescript: { onlyRemoveTypeImports: false } } },
  },
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
