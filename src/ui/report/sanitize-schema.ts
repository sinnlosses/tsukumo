// レポート（発話の詳細）に書かれた HTML を、表示してよい形へ削ぎ落とす rehype-sanitize の
// schema。もとは移行前の自前サニタイザ（許可リスト方式の
// 自前パーサ）だったものを、同じ許可リストのまま unified（hast-util-sanitize）の schema に写した
// （移行の段6。docs/design.md 6.3）。
//
// **なぜ通すのか**: レポートを書くのはモデル自身で、Markdown の語彙（見出し・表・コード・箇条書き）
// だけでは段組みやカードのような見せ方ができない（`docs/requirements.md` 4.2）。
//
// **なぜ削ぎ落とすのか**: このページは会話の内容を持っている（`docs/coding-standards.md`
// 「会話内容の扱い」）。**許可リスト方式**（載っているものだけを通す）にしてあるので、知らない
// 要素・属性は自動的に落ちる。
//
// hast-util-sanitize は `schema` を defaultSchema と**トップレベルのキーごとに**浅くマージする
// （`{...defaultSchema, ...schema}`）。ここに書いていないキー（`ancestors` 以外）は defaultSchema
// の値に落ちるので、**通すつもりの物は必ずここに書く**（img を許可しないのも、tagNames に
// 書かないことで表す）。

// 型は `rehype-sanitize` の `Options` から取る（実体は hast-util-sanitize の `Schema` だが、
// あちらは推移的な依存なので直接 import しない。足してよい依存は docs/design.md 11章の一覧だけ）。
import { type Options as Schema } from "rehype-sanitize"

/**
 * 通してよい要素（56個）。ここに無い要素は、**中身のテキストだけを残して**タグが落ちる
 * （`img` もここに無いので、`src`/`alt` を持たない裸のテキストにすら残らず消える）。
 *
 * `h2` / `h3` は `report-notation.ts` が勧める見出しの記法（`##` / `###`）が hast に変換された
 * ときのタグ名（`h1` は無い。規約が「レポートの見出しに `#` は使わない」と決めているため通さない）。
 * **DOM に出るのは実際には `h4` / `h5`**（`src/ui/report/markdown.tsx` の `components` が写す。
 * ページには利用者の依頼を示す本物の `<h2 class="turn-request">` が1つあるので、レポート側の
 * 見出しがそれと同じ段に並ぶと見出しの階層が壊れるため、タグを一段落とす）。ここで `h2`/`h3` を
 * 許可リストに残すのは、その書き替えが起きる前に hast-util-sanitize が中身ごと落としてしまう
 * （サニタイズは `components` より前に効く）のを防ぐため。
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
  "mark",
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
 * **中身ごと捨てる要素。** タグを落として中身のテキストを残すと、スクリプト本体が
 * 地の文として画面に出てしまうため、閉じタグまでまとめて捨てる（`strip`）。
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
 * 要素を問わず通してよい属性（class・id・title・table のセル結合・details の open・
 * datetime・aria・role・SVG の座標や描画の属性。42個）。`href` は `<a>` だけ、`style` /
 * `marker-end` / `marker-start` は値を検査するので別に定義する。
 *
 * 名前は **hast のプロパティ名**（DOM プロパティ名に合わせた camelCase。`property-information`
 * の変換規則）で書く。もとの HTML 属性名（kebab-case）はコメントで添える。
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
  // hast（property-information）はここだけ React の実際の prop 名と大文字小文字が違う
  // （`strokeDashArray` / `strokeLineCap`。React 側への変換は hast-util-to-jsx-runtime が
  // `hast-to-react` の対応表で行うので、ここは hast 側の綴りに合わせる）。
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
 * `href` に入れてよいスキームの allowlist。**それ以外（`javascript:` / `data:` / 不明なスキーム）は
 * 落ちる**（`docs/coding-standards.md`「会話内容の扱い」と同じ思想）。相対リンク（`/` や `#` で
 * 始まるもの）は `protocols` の仕組み上、スキームが無いので常に通る（`isAllowedLinkUrl` と同じ）。
 */
const ALLOWED_LINK_SCHEMES: readonly string[] = ["http", "https", "mailto"]

/**
 * `style` 属性で許してよい値の正規表現。**外部を読みに行く記法（`url(` / `@import` /
 * `expression(`）・`javascript:`・タグの混入（`<`）を含むものは丸ごと落とす**（値が正規表現に
 * マッチしなければ属性ごと落ちる。もとの `isAllowedStyle` と同じ判定を1つの正規表現にした）。
 * 大文字小文字を区別しない（`i` フラグ）。改行を含む値も1つの文字列として見る（`s` フラグ）。
 */
export const ALLOWED_STYLE_PATTERN = /^(?:(?!url\(|@import|expression\(|javascript:|<).)*$/is

/** `marker-end` / `marker-start` は、ページ内の定義（`url(#id)`）だけを許す（外部を指す形は落とす）。 */
const ALLOWED_MARKER_REFERENCE_PATTERN = /^url\(#[A-Za-z0-9_-]+\)$/

/**
 * レポートの HTML を削ぎ落とす rehype-sanitize の schema。**移行前の自前サニタイザと同じ許可リスト**
 * （54要素・42属性）を hast-util-sanitize の形に写したものに、見出し（`h2`/`h3`。上の注記）の
 * 2要素を足した56要素・42属性。
 *
 * - **`clobber: []`**（defaultSchema の既定は `id` 等に `user-content-` を前置してDOMクロバー対策
 *   をするが、それをやると SVG の `marker-end="url(#foo)"` が指す `id="foo"` と値がズレて
 *   参照が壊れる）。もとの自前サニタイザも `id` をそのまま通していたので、ここは
 *   ふるまいを変えず引き継ぐだけ（新しい弱点ではない）
 * - **`strip` に script 等7要素**を指定し、中身ごと捨てる（既定の `strip` は `script` だけなので
 *   明示する必要がある）
 * - **`img` は `tagNames` に無い**ので、中身（無い）だけが残って消える
 */
export const REPORT_SANITIZE_SCHEMA: Schema = {
  // hast-util-sanitize の型は可変配列を要求する。ここで渡すのは一度きりの複製で、
  // 呼び出し先が書き換えることはない（`docs/coding-standards.md`「型を迂回するキャストを
  // 使わない」の対応として、キャストではなく複製で型を合わせる）。
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
    // GFM の列揃え（`:---:` / `---:`）は mdast-util-to-hast が `th` / `td` に `align` を
    // 直接付けて表す。**もとの自前サニタイザの42属性には無かった追加**
    // （旧レンダラは列揃え自体を描けなかった。docs/requirements.md 4.2）。
    // `align` 以外の属性はここに書かなくても `*` の定義へ自動でフォールバックする
    // （hast-util-sanitize の仕組み。tag 固有の定義に無ければ `*` を見る）。
    th: ["align"],
    td: ["align"],
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
