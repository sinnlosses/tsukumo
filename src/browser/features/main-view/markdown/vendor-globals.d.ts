// 外部ライブラリが、ブラウザのグローバルに置くものの型。
//
// **パッケージは npm にあるが、束ねずに素の JavaScript を `<script>` で読む**ので、そこから型は
// 付いてこない（`src/server/adapter/vendor-asset.ts`）。ここに**使っている分だけ**を手で書く。
// 使っていない API を足さない（書いた分が「使ってよい」の線になる）。
//
// **DOM を morph するライブラリと hljs は無い**（移行の段6。領域の差し替えごと DOM を書き換える経路は消え、
// コードの色付けは `rehype-highlight` が hast の時点で済ませるので、ブラウザ側で
// `hljs.highlightElement` を呼ぶ経路も無くなった。docs/design.md 6.4、段の記録は
// `docs/history/decision.md`「design.md 12. 移行の段階」）。

declare global {
  /**
   * mermaid（`/vendor/mermaid.min.js` から読む）。**`src/browser/features/main-view/markdown/mermaid-block.tsx`
   * が図の記法を見つけたときだけ**動的に読み込むので、参照する時点（読み込みの `then` の中）
   * では必ず存在する。
   */
  const mermaid: {
    readonly initialize: (options: {
      readonly startOnLoad: boolean
      readonly theme: string
      readonly securityLevel: string
      /**
       * 失敗したときに mermaid 自身がエラーの絵を `<pre class="mermaid">` の中へ描くのを止める。
       * `true` だと `run()` は絵を描くかわりに Promise を reject する
       * （`src/browser/features/main-view/markdown/mermaid-block.tsx` が拾う）。
       */
      readonly suppressErrorRendering: boolean
    }) => void
    readonly run: (options: { readonly nodes: readonly Element[] }) => Promise<void>
  }

  /**
   * Chart.js（`/vendor/chart.umd.min.js` から読む）。mermaid と同じく、必要になったときだけ読み込む。
   * `defaults` は**明るい背景向けの既定値**（文字も目盛り線も黒寄り）を暗い配色へ寄せるためだけに
   * 触る（`src/browser/features/main-view/markdown/chart-block.tsx`）。**`borderColor` は
   * 書かない** — 4.5.0 から、そこが既定から動いていると内蔵の colors プラグインが系列に色を
   * 配らなくなるので、線の色は `scale` の側へ書く（同ファイルのコメント）。
   */
  const Chart: (new (target: Element, config: unknown) => unknown) & {
    readonly defaults: {
      color: string
      readonly scale: {
        readonly grid: { color: string }
        readonly border: { color: string }
      }
    }
  }
}

export {}
