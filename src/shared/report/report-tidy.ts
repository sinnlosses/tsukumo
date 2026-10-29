// `report` ツールで受け取ったレポートの整形（「検査 → 整形 → 描画」の整形の段）。
//
// 落とすのは、落としても意味が変わらない行だけで、言い換え・要約・並べ替えはしない。
// 判定は行の丸ごとの一致か、中身が何も無いことだけで、行の一部を削ることも無い。
// 直すのに書き直しが要る条（段落を表へ移す・結論を短くする）は検査の段が差し戻す側で、ここと同じ条は持たない。
//
// 記録は引数のまま持ち、整形は描くときの導出で掛ける。
// 規則を変えたとき、過去のやり取りにも、セッションの復元で組み直したやり取りにも同じように効く。
//
// 整形は塊ごとに掛ける。逃げ道（`markdown` の塊）は Markdown として構文解析せず、行で見る（フェンスの中は触らない）。

import { fencedLineFlags } from "./report-fence.ts"
import type { ReportOutline, ReportOutlineLeaf } from "./report-outline.ts"

export type ReportOutlineTidyInput = {
  readonly conclusion: string
  readonly outline: ReportOutline
}

export type TidiedReportOutline = {
  /** 本文の節だけを整形したもの。落とした葉と、葉の残らない節は除く。図・振り返りはそのまま。 */
  readonly outline: ReportOutline
  readonly droppedLeafIds: ReadonlySet<string>
}

/**
 * 節の並びから、意味を変えずに落とせるものを落とす。落とすのは次のもので、落とすものが無ければ
 * 中身は引数のまま:
 *
 * - 本文の冒頭で `conclusion` を繰り返しているもの（`conclusion` はすぐ上に描かれるので、同じ文が
 *   2度並ぶだけになる）。最初の葉が `Paragraph` なら葉ごと、逃げ道なら頭の行。
 *   見るのは葉のある最初の節の最初の葉だけ
 * - 前置き・締めの定型だけの `Paragraph` の葉と、逃げ道の中の定型だけの行（{@link BOILERPLATE_LINES} と丸ごと一致するもの）
 * - 逃げ道の中の中身の無い見出し（文字が無いか、次に来るのが同じか浅い見出し・葉の終わり）
 * - 落として葉の残らない節（見出しごと）
 */
export function tidyReportOutline(report: ReportOutlineTidyInput): TidiedReportOutline {
  const [first] = report.outline.sections.filter((section) => section.leaves.length > 0)
  const firstLeafId = first?.leaves[0]?.id
  const tidied = report.outline.sections.map((section) =>
    section.leaves.map((leaf) => tidyLeaf(leaf, leaf.id === firstLeafId ? report.conclusion : "")),
  )
  return {
    outline: {
      ...report.outline,
      sections: report.outline.sections.flatMap((section, index) => {
        const leaves = (tidied[index] ?? []).flatMap((leaf) => (leaf === undefined ? [] : [leaf]))
        return leaves.length === 0 ? [] : [{ ...section, leaves }]
      }),
    },
    droppedLeafIds: new Set(
      report.outline.sections.flatMap((section, index) =>
        section.leaves.flatMap((leaf, position) =>
          tidied[index]?.[position] === undefined ? [leaf.id] : [],
        ),
      ),
    ),
  }
}

/** 葉1つを整形する。落とすなら undefined。整形が掛かるのは `Paragraph` と `Markdown` だけ。 */
function tidyLeaf(leaf: ReportOutlineLeaf, conclusion: string): ReportOutlineLeaf | undefined {
  switch (leaf.component) {
    case "Paragraph":
      return isBoilerplateLine(leaf.text) ||
        (conclusion.trim() !== "" &&
          joinedText(leaf.text.split("\n")) === joinedText(conclusion.split("\n")))
        ? undefined
        : leaf
    case "Markdown": {
      const markdown = tidyMarkdown(leaf.markdown, conclusion)
      return markdown.trim() === "" ? undefined : { ...leaf, markdown }
    }
    default:
      return leaf
  }
}

/** 逃げ道の中身から、意味を変えずに落とせる行を落とす（{@link tidyReportOutline} の逃げ道の3つ）。 */
function tidyMarkdown(markdown: string, conclusion: string): string {
  const lines = markdown.split("\n")
  const fenced = fencedLineFlags(lines)
  const repeated = repeatedConclusionLines(lines, fenced, conclusion)
  const boilerplate = lines.flatMap((line, index) =>
    !fenced[index] && isBoilerplateLine(line) ? [index] : [],
  )
  const dropped = new Set([...repeated, ...boilerplate])
  const headings = emptyHeadingLines(lines, fenced, dropped)

  return dropped.size + headings.length === 0
    ? markdown
    : withoutLines(lines, fenced, new Set([...dropped, ...headings]))
}

/**
 * 前置き・締めの定型。内容を持たないことが文面だけで決まる行だけを、行ぜんぶとの一致で落とす（末尾の句点・感嘆符は見ない）。
 * 「〜を見てみます」のような型で当てる判定は置かない（型に当てると中身のある行まで黙って消え、消えたことに誰も気付けない）。
 */
const BOILERPLATE_LINES: ReadonlySet<string> = new Set([
  "以上",
  "以上です",
  "以上になります",
  "以上となります",
  "報告は以上です",
  "報告します",
  "結果を報告します",
  "まとめます",
  "以下にまとめます",
  "何かあれば言ってください",
  "何かあれば聞いてください",
  "何かあればお知らせください",
])

/** 行末の句点・感嘆符（定型と比べるときに外す）。 */
const TRAILING_PUNCTUATION = /[。．.！!]+$/

/** ATX 見出し（行頭の空白は3つまで）。1つ目が `#` の数、2つ目が文字（閉じの `#` は除く）。 */
const ATX_HEADING = /^ {0,3}(#{1,6})(?:[ \t]+(.*?))?(?:[ \t]+#+)?[ \t]*$/

/**
 * 冒頭の段落の頭から数えて、つなげると `conclusion` と同じになる行（行の前後の空白と
 * 改行の位置は見ない）。一部だけの一致は落とさない（行を削ることになるため）。
 */
function repeatedConclusionLines(
  lines: readonly string[],
  fenced: readonly boolean[],
  conclusion: string,
): readonly number[] {
  const target = joinedText(conclusion.split("\n"))
  const start = lines.findIndex((line) => line.trim() !== "")
  if (target === "" || start === -1) {
    return []
  }
  const blankAfter = lines.findIndex((line, index) => index > start && line.trim() === "")
  const paragraph = lines
    .slice(start, blankAfter === -1 ? lines.length : blankAfter)
    .map((line, offset) => ({ line, index: start + offset }))
  const count = paragraph.findIndex(
    (_, offset) => joinedText(paragraph.slice(0, offset + 1).map(({ line }) => line)) === target,
  )
  const head = paragraph.slice(0, count + 1)
  return count === -1 || head.some(({ index }) => fenced[index])
    ? []
    : head.map(({ index }) => index)
}

/** 行を前後の空白を外してつなげる。 */
function joinedText(lines: readonly string[]): string {
  return lines.map((line) => line.trim()).join("")
}

function isBoilerplateLine(line: string): boolean {
  return BOILERPLATE_LINES.has(line.trim().replace(TRAILING_PUNCTUATION, ""))
}

/**
 * 中身の無い見出し。後ろから1回なめるので、小見出しがみな空で落ちた親の見出しも、
 * 定型の行を落として空になった節の見出しも同じ回で落ちる。フェンスの行・HTML の閉じタグ
 * などは中身として数える（中身が塊だけの節は落とさない）。
 */
function emptyHeadingLines(
  lines: readonly string[],
  fenced: readonly boolean[],
  dropped: ReadonlySet<number>,
): readonly number[] {
  /** `next` は後ろで次に残る行の種類。`end` は本文の終わり、数は見出しの深さ。 */
  type Scan = { readonly empties: readonly number[]; readonly next: "end" | "content" | number }
  return lines.reduceRight<Scan>(
    (state, line, index) => {
      if (dropped.has(index) || line.trim() === "") {
        return state
      }
      const heading = fenced[index] ? undefined : (ATX_HEADING.exec(line) ?? undefined)
      if (heading === undefined) {
        return { ...state, next: "content" }
      }
      const depth = (heading[1] ?? "").length
      const empty =
        (heading[2] ?? "").trim() === "" ||
        state.next === "end" ||
        (typeof state.next === "number" && state.next <= depth)
      return empty ? { ...state, empties: [...state.empties, index] } : { ...state, next: depth }
    },
    { empties: [], next: "end" },
  ).empties
}

/**
 * 落とす行を除いて本文に戻す。落とした行の跡で空行が重なったら1つに詰め、頭と末尾の空行は
 * 外す。それ以外の空行は（重なっていても）そのまま残す。
 */
function withoutLines(
  lines: readonly string[],
  fenced: readonly boolean[],
  dropped: ReadonlySet<number>,
): string {
  const initial: { readonly kept: readonly string[]; readonly skipBlank: boolean } = {
    kept: [],
    skipBlank: false,
  }
  const { kept } = lines.reduce((state, line, index) => {
    if (dropped.has(index)) {
      const last = state.kept.at(-1)
      return { ...state, skipBlank: last === undefined || last.trim() === "" }
    }
    if (state.skipBlank && !fenced[index] && line.trim() === "") {
      return state
    }
    return { kept: [...state.kept, line], skipBlank: false }
  }, initial)
  const first = kept.findIndex((line) => line.trim() !== "")
  const last = kept.findLastIndex((line) => line.trim() !== "")
  return first === -1 ? "" : kept.slice(first, last + 1).join("\n")
}
