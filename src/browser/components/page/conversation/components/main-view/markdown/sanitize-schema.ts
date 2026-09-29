// レポート（発話の詳細）に書かれた HTML を、表示してよい形へ削ぎ落とす rehype-sanitize の schema。
//
// HTML を通すのは、レポートを書くのはモデル自身で、Markdown の語彙（見出し・表・コード・箇条書き）だけでは段組みやカードのような見せ方ができないため。
// 削ぎ落とすのは、このページが会話の内容を持っているため。
// 許可リスト方式（載っているものだけを通す）にしてあるので、知らない要素・属性は自動的に落ちる。
//
// hast-util-sanitize は `schema` を defaultSchema とトップレベルのキーごとに浅くマージする（`{...defaultSchema, ...schema}`）。
// ここに書いていないキー（`ancestors` 以外）は defaultSchema の値に落ちるので、通すつもりの物は必ずここに書く（img を許可しないのも、tagNames に書かないことで表す）。

// 型は `rehype-sanitize` の `Options` から取る。
// 実体は hast-util-sanitize の `Schema` だが、あちらは推移的な依存なので直接 import しない（docs/architecture/build.md「ビルドと依存」）。
import type { Options as Schema } from "rehype-sanitize"

import { CODE_FILE_NAME_PROPERTY } from "./code-file-name.ts"

/**
 * 通してよい要素（59個）。ここに無い要素は、中身のテキストだけを残してタグが落ちる（`img` もここに無いので、裸のテキストにすら残らず消える）。
 *
 * 操作できる要素は1つも無い（`input` / `button` / `meter` / `progress`）。
 * レポートは読む面で、押せるように見えて何も起きないものを混ぜない。
 * チェックリスト（`- [ ]`）の `<input type="checkbox">` は、ここへ来る前に `rehypeTaskCheck` が静的な印の `<span>` に畳む。
 *
 * 記法に無い要素も、次の条件のどちらかを満たすものは通す（モデルの即興を落とさないため）:
 *
 * - `section` / `article` / `aside` のように、見た目を持たない入れ物（落としても中身はそのまま出るので、通しても通さなくても読み手が見るものは変わらない）
 * - `del` / `ins` / `sup` / `sub` のように、ブラウザ既定の見た目がこの配色から浮かないもの
 * - `small` / `kbd` / `samp` / `figure` / `figcaption` のように、既定のままだとタイプスケールや配色から外れるので、report-notation.module.css の `.detail-block` 配下で当て直したもの
 *
 * `mark` は通さない。
 * 既定の黄地に黒文字はこの配色から浮くうえ、当て直すと強調の道具が `strong` / `badge` と並んで3通りになる。タグが落ちても中の文字は残る。
 *
 * `h2` / `h3` は記法が勧める見出し（`##` / `###`）が hast に変換されたときのタグ名（`h1` は、記法が「レポートの見出しに `#` は使わない」と決めているため通さない）。
 * DOM に出るのは実際には `h4` / `h5`（`SectionHeading` / `SubHeading` が写す）。
 * ここで `h2`/`h3` を許可リストに残すのは、その書き替えが起きる前に hast-util-sanitize が中身ごと落としてしまう（サニタイズは `components` より前に効く）のを防ぐため。
 */
const ALLOWED_TAG_NAMES: readonly string[] = [
  "div",
  "span",
  "p",
  "br",
  "hr",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "ul",
  "ol",
  "li",
  "dl",
  "dt",
  "dd",
  "table",
  "thead",
  "tbody",
  "tfoot",
  "tr",
  "th",
  "td",
  "pre",
  "code",
  "kbd",
  "samp",
  "strong",
  "em",
  "b",
  "i",
  "small",
  "sup",
  "sub",
  // 取り消し線（GFM の `~~`）と、その対になる挿入。
  // CSS は当てない（ブラウザ既定の打ち消し線・下線は色を持たず、どの配色でも同じに読める）。
  "del",
  "ins",
  "blockquote",
  "section",
  "article",
  "aside",
  "figure",
  "figcaption",
  "details",
  "summary",
  "a",
  // 図を手で組むための SVG。座標や描画の属性は下の SVG_PRESENTATION_ATTRIBUTES で通す。
  "svg",
  "g",
  "defs",
  "marker",
  "path",
  "circle",
  "ellipse",
  "rect",
  "line",
  "polyline",
  "polygon",
  "text",
  "tspan",
  "title",
]

/**
 * 中身ごと捨てる要素。
 * タグを落として中身のテキストを残すと、スクリプト本体が地の文として画面に出てしまうため、閉じタグまでまとめて捨てる（`strip`）。
 */
const STRIPPED_TAG_NAMES: readonly string[] = [
  "script",
  "style",
  "iframe",
  "object",
  "embed",
  "template",
  "noscript",
]

/**
 * 要素を問わず通してよい属性（class・id・title・table のセル結合・details の open・datetime・aria・role・SVG の座標や描画の属性。42個）。
 * `href` は `<a>` だけ、`style` / `marker-end` / `marker-start` は値を検査するので別に定義する。
 *
 * 名前は hast のプロパティ名（DOM プロパティ名に合わせた camelCase。`property-information` の変換規則）で書く。
 * もとの HTML 属性名（kebab-case）はコメントで添える。
 */
const GLOBAL_ATTRIBUTES: readonly string[] = [
  "className", // class
  "id",
  "title",
  "colSpan", // colspan
  "rowSpan", // rowspan
  "open",
  "dateTime", // datetime
  "ariaLabel", // aria-label
  "ariaHidden", // aria-hidden
  "role",
  // SVG の描画に要るもの。
  "viewBox", // viewbox
  "width",
  "height",
  "x",
  "y",
  "x1",
  "y1",
  "x2",
  "y2",
  "cx",
  "cy",
  "r",
  "rx",
  "ry",
  "d",
  "points",
  "fill",
  "stroke",
  "strokeWidth", // stroke-width
  // hast（property-information）はここだけ React の実際の prop 名と大文字小文字が違う（`strokeDashArray` / `strokeLineCap`）。
  // React 側への変換は hast-util-to-jsx-runtime が `hast-to-react` の対応表で行うので、ここは hast 側の綴りに合わせる。
  "strokeDashArray", // stroke-dasharray
  "strokeLineCap", // stroke-linecap
  "transform",
  "textAnchor", // text-anchor
  "dominantBaseline", // dominant-baseline
  "fontSize", // font-size
  "fontFamily", // font-family
  "fontWeight", // font-weight
  "opacity",
  "orient",
  "refX", // refx
  "refY", // refy
  "markerWidth", // markerwidth
  "markerHeight", // markerheight
  "preserveAspectRatio", // preserveaspectratio
  "xmlns",
]

/**
 * `href` に入れてよいスキームの allowlist。それ以外（`javascript:` / `data:` / 不明なスキーム）は落ちる。
 * 相対リンク（`/` や `#` で始まるもの）は `protocols` の仕組み上、スキームが無いので常に通る。
 */
const ALLOWED_LINK_SCHEMES: readonly string[] = ["http", "https", "mailto"]

/**
 * `style` 属性で許してよい値の正規表現。
 * 外部を読みに行く記法（`url(` / `@import` / `expression(`）・`javascript:`・タグの混入（`<`）を含むものは丸ごと落とす（値が正規表現にマッチしなければ属性ごと落ちる）。
 * 大文字小文字を区別しない（`i` フラグ）。改行を含む値も1つの文字列として見る（`s` フラグ）。
 */
const ALLOWED_STYLE_PATTERN = /^(?:(?!url\(|@import|expression\(|javascript:|<).)*$/is

/** `marker-end` / `marker-start` は、ページ内の定義（`url(#id)`）だけを許す（外部を指す形は落とす）。 */
const ALLOWED_MARKER_REFERENCE_PATTERN = /^url\(#[A-Za-z0-9_-]+\)$/

/**
 * レポートの HTML を削ぎ落とす rehype-sanitize の schema（59要素・42属性）。
 *
 * - `clobber: []`。defaultSchema の既定は `id` 等に `user-content-` を前置して DOM クロバー対策をするが、それをやると SVG の `marker-end="url(#foo)"` が指す `id="foo"` と値がズレて参照が壊れる
 * - `strip` に script 等7要素を指定し、中身ごと捨てる（既定の `strip` は `script` だけなので明示する必要がある）
 * - `img` は `tagNames` に無いので、中身（無い）だけが残って消える
 */
export const REPORT_SANITIZE_SCHEMA: Schema = {
  // hast-util-sanitize の型は可変配列を要求するので、キャストではなく一度きりの複製で型を合わせる（呼び出し先が書き換えることはない）。
  tagNames: [...ALLOWED_TAG_NAMES],
  strip: [...STRIPPED_TAG_NAMES],
  clobber: [],
  ancestors: {
    thead: ["table"],
    tbody: ["table"],
    tfoot: ["table"],
    tr: ["table"],
    td: ["table"],
    th: ["table"],
  },
  attributes: {
    // `href` 以外は `*` の定義へ自動でフォールバックする（下の注記と同じ仕組み）。
    a: ["href"],
    // GFM の列揃え（`:---:` / `---:`）は mdast-util-to-hast が `th` / `td` に `align` を直接付けて表す。
    // `align` 以外の属性はここに書かなくても `*` の定義へ自動でフォールバックする（hast-util-sanitize の仕組み。tag 固有の定義に無ければ `*` を見る）。
    th: ["align"],
    td: ["align"],
    // フェンスの info 文字列に書いたファイル名（```diff src/foo.ts）を `rehypeCodeFileName` が移してくる属性。
    // `code` だけに許す（`*` に足すと、どの要素にも書ける属性が1つ増える。上の42個の数もこの属性を含まない）。
    // 読むのは `Pre` で、hast の段階でラベルに変える（属性そのものは `data-filename` として DOM にも残るが、CSS も JS も引いていない）。
    code: [CODE_FILE_NAME_PROPERTY],
    "*": [
      ...GLOBAL_ATTRIBUTES,
      ["style", ALLOWED_STYLE_PATTERN],
      ["markerEnd", ALLOWED_MARKER_REFERENCE_PATTERN],
      ["markerStart", ALLOWED_MARKER_REFERENCE_PATTERN],
    ],
  },
  protocols: {
    href: [...ALLOWED_LINK_SCHEMES],
  },
}
