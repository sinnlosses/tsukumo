// レポート（ターンの本文の詳細）に書かれた HTML を、表示してよい形へ削ぎ落とす rehype-sanitize の schema。
//
// 通すのは、Markdown が作る要素と、tsukumo が塊から組む形の要素・属性（印の class・SVG の図・棒の幅）だけ。
// それ以外（色・変形・任意の `style` など）は出どころを問わず落とす。
// tsukumo の出力とモデルが書いた HTML は見分けないので、同じ形で書かれたものは通る。
// 削ぎ落とすのは、このページが会話の内容を持っているため。
// 許可リスト方式（載っているものだけを通す）にしてあるので、知らない要素・属性は自動的に落ちる。
//
// hast-util-sanitize は `schema` を defaultSchema とトップレベルのキーごとに浅くマージする（`{...defaultSchema, ...schema}`）。
// ここに書いていないキー（`ancestors` 以外）は defaultSchema の値に落ちるので、通すつもりの物は必ずここに書く。

// 型は `rehype-sanitize` の `Options` から取る。
// 実体は hast-util-sanitize の `Schema` だが、あちらは推移的な依存なので直接 import しない（docs/architecture/build.md「ビルドと依存」）。
import type { Options as Schema } from "rehype-sanitize"

import {
  IMAGE_REGION_PATTERN,
  REPORT_IMAGE_SIZE_PATTERN,
  REPORT_IMAGE_SRC_PATTERN,
} from "../../../../../../../shared/report/report-image.ts"
import {
  CODE_FILE_NAME_PROPERTY,
  CODE_FILE_PATH_PROPERTY,
  CODE_MARKS_PROPERTY,
} from "./code-file-name.ts"

/**
 * 通してよい要素（46個）。ここに無い要素は、中身のテキストだけを残してタグが落ちる。
 *
 * `img` は通すが、`src` は tsukumo のサーバが棚から配る `/report-image/` だけを通す（外部の URL・`data:`・ほかのパスは属性ごと落ちる）。
 *
 * 操作できる要素は1つも無い（`input` / `button` / `meter` / `progress`）。
 * レポートは読む面で、押せるように見えて何も起きないものを混ぜない。
 * チェックリスト（`- [ ]`）の `<input type="checkbox">` は、ここへ来る前に `rehypeTaskCheck` が静的な印の `<span>` に畳む。
 *
 * `aside` は tsukumo が余白の柱の傍注（`gutter-note`）に使い、見た目はその class にだけ当てる。
 * `section` / `sup` は Markdown の脚注が作る。
 *
 * `h2` / `h3` は記法が勧める見出し（`##` / `###`）が hast に変換されたときのタグ名（`h1` は、記法が「レポートの見出しに `#` は使わない」と決めているため通さない）。
 * DOM に出るのは実際には `h4` / `h5`（`SectionHeading` / `SubHeading` が写す）。
 * ここで `h2`/`h3` を許可リストに残すのは、その書き替えが起きる前に hast-util-sanitize が中身ごと落としてしまう（サニタイズは `components` より前に効く）のを防ぐため。
 *
 * SVG は tsukumo が `svg` の塊と `graph`・`stats` の折れ線で組む要素だけ。
 */
const ALLOWED_TAG_NAMES: readonly string[] = [
  "div",
  "span",
  "p",
  "br",
  "wbr",
  "hr",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "ul",
  "ol",
  "li",
  "table",
  "thead",
  "tbody",
  "tr",
  "th",
  "td",
  "pre",
  "code",
  "strong",
  "em",
  "b",
  "small",
  "sup",
  // 取り消し線（GFM の `~~`）。
  "del",
  "blockquote",
  "section",
  "aside",
  "details",
  "summary",
  "a",
  "img",
  "svg",
  "defs",
  "marker",
  "path",
  "circle",
  "rect",
  "line",
  "polyline",
  "polygon",
  "text",
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
 * 要素を問わず通してよい属性（class・id・title・aria・role・tsukumo が組む SVG の座標や描画の属性。32個）。
 * `href` は `<a>` だけ、`marker-end` / `marker-start` は値を検査するので別に定義する（`style` の値の検査は schema の外）。
 *
 * 名前は hast のプロパティ名（DOM プロパティ名に合わせた camelCase。`property-information` の変換規則）で書く。
 * もとの HTML 属性名（kebab-case）はコメントで添える。
 */
const GLOBAL_ATTRIBUTES: readonly string[] = [
  "className", // class
  "id",
  "title",
  "ariaLabel", // aria-label
  "ariaHidden", // aria-hidden
  "ariaCurrent", // aria-current
  "role",
  // tsukumo が組む SVG の描画に要るもの。色は書かず、CSS が当てる。
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
  "d",
  "points",
  "strokeWidth", // stroke-width
  // hast（property-information）はここだけ React の実際の prop 名と大文字小文字が違う（`strokeDashArray`）。
  // React 側への変換は hast-util-to-jsx-runtime が `hast-to-react` の対応表で行うので、ここは hast 側の綴りに合わせる。
  "strokeDashArray", // stroke-dasharray
  "textAnchor", // text-anchor
  "dominantBaseline", // dominant-baseline
  "fontSize", // font-size
  "orient",
  "refX", // refx
  "refY", // refy
  "markerWidth", // markerwidth
  "markerHeight", // markerheight
]

/**
 * `href` に入れてよいスキームの allowlist。それ以外（`javascript:` / `data:` / 不明なスキーム）は落ちる。
 * 相対リンク（`/` や `#` で始まるもの）は `protocols` の仕組み上、スキームが無いので常に通る。
 */
const ALLOWED_LINK_SCHEMES: readonly string[] = ["http", "https", "mailto"]

/** `marker-end` / `marker-start` は、ページ内の定義（`url(#id)`）だけを許す（外部を指す形は落とす）。 */
const ALLOWED_MARKER_REFERENCE_PATTERN = /^url\(#[A-Za-z0-9_-]+\)$/

/**
 * レポートの HTML を削ぎ落とす rehype-sanitize の schema（46要素・32属性）。
 *
 * - `clobber: []`。defaultSchema の既定は `id` 等に `user-content-` を前置して DOM クロバー対策をするが、それをやると SVG の `marker-end="url(#foo)"` が指す `id="foo"` と値がズレて参照が壊れる
 * - `strip` に script 等7要素を指定し、中身ごと捨てる（既定の `strip` は `script` だけなので明示する必要がある）
 * - `protocols` は `href` だけ。`src` のスキームは見ず、`img` の `src` の値の検査（{@link REPORT_IMAGE_SRC_PATTERN}）だけで絞る
 */
export const REPORT_SANITIZE_SCHEMA: Schema = {
  // hast-util-sanitize の型は可変配列を要求するので、キャストではなく一度きりの複製で型を合わせる（呼び出し先が書き換えることはない）。
  tagNames: [...ALLOWED_TAG_NAMES],
  strip: [...STRIPPED_TAG_NAMES],
  clobber: [],
  ancestors: {
    thead: ["table"],
    tbody: ["table"],
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
    // `code` だけに許す（`*` に足すと、どの要素にも書ける属性が1つ増える。上の32個の数もこの属性を含まない）。
    // 読むのは `Pre` で、hast の段階でラベルに変える（属性そのものは `data-filename` として DOM にも残るが、CSS も JS も引いていない）。
    // `files` の塊の `code` が運ぶフルパス（`data-file-path`）も同じ理由で `code` だけに許す。
    code: [CODE_FILE_NAME_PROPERTY, CODE_FILE_PATH_PROPERTY, CODE_MARKS_PROPERTY],
    // `svg` の塊の `rect`・`line` の `tone`（色の目印）。値は a〜e だけ。
    // 折り返し配置の `graph` は、群の囲み（`dataFrame`・地の色の番号 `dataGround`）・変更の印（`dataChange`）・戻り道（`dataReturn`）も持ち、
    // `svg` の塊と地の塗りを分けるため `svg` に `dataGraph` を付ける。
    svg: [["dataGraph", /^$/]],
    rect: [
      ["dataTone", /^[a-e]$/],
      ["dataGround", /^[1-3]$/],
      ["dataFrame", /^$/],
      ["dataChange", /^(?:added|removed|changed)$/],
    ],
    line: [["dataTone", /^[a-e]$/]],
    polygon: [
      ["dataTone", /^[a-e]$/],
      ["dataChange", /^(?:added|removed|changed)$/],
    ],
    polyline: [
      ["dataTone", /^[a-e]$/],
      ["dataChange", /^(?:added|removed|changed)$/],
      ["dataReturn", /^$/],
    ],
    // `rect` の `sub`（題の下の説明）の `text` が持つ目印。
    text: [["dataSub", /^$/]],
    img: [
      ["src", REPORT_IMAGE_SRC_PATTERN],
      "alt",
      ["dataChangeRegion", IMAGE_REGION_PATTERN],
      ["width", REPORT_IMAGE_SIZE_PATTERN],
      ["height", REPORT_IMAGE_SIZE_PATTERN],
    ],
    "*": [
      ...GLOBAL_ATTRIBUTES,
      // 値の検査は `rehypeStyleAllowlist`（サニタイザの直前）が済ませる。
      "style",
      ["markerEnd", ALLOWED_MARKER_REFERENCE_PATTERN],
      ["markerStart", ALLOWED_MARKER_REFERENCE_PATTERN],
    ],
  },
  protocols: {
    href: [...ALLOWED_LINK_SCHEMES],
  },
}
