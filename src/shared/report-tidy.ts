// `report` ツールで受け取ったレポートの整形（「検査 → 整形 → 描画」の整形の段。
// docs/display.md 4.2「出力の分離（セリフと詳細）」）。
//
// 落とすのは、落としても意味が変わらない行だけで、言い換え・要約・並べ替えはしない。
// 判定は行の丸ごとの一致か、中身が何も無いことだけで、行の一部を削ることも無い。
// 直すのに書き直しが要る条（段落を表へ移す・結論を短くする）は検査の段
// （`src/server/report/core/report-violation.ts`）が差し戻す側で、ここと同じ条は持たない。
//
// 掛けるのはメインビューの導出（`main-view.ts`）で、記録は引数のまま持つ。 規則を変えたとき
// 過去のやり取りにも、セッションの復元で組み直したやり取りにも同じように効く。
//
// 本文は Markdown として構文解析せず、行で見る（フェンスの中は触らない。検査の段と同じ理由）。

/** 整形にかけるレポート。`body` の「無い」は空の文字列。 */
export type ReportTidyInput = {
  readonly conclusion: string
  readonly body: string
}

/**
 * `body` から、意味を変えずに落とせる行を落とす。落とすのは次の3つで、落とすものが無ければ
 * 引数のまま返す:
 *
 * - 冒頭で `conclusion` を繰り返している行（`conclusion` はすぐ上に描かれるので、同じ文が
 *   2度並ぶだけになる）
 * - 前置き・締めの定型だけの行（{@link BOILERPLATE_LINES} と丸ごと一致する行）
 * - 中身の無い見出し（文字が無いか、次に来るのが同じか浅い見出し・本文の終わり）
 */
export function tidyReportBody(report: ReportTidyInput): string {
  const lines = report.body.split("\n")
  const fenced = fencedLineFlags(lines)
  const repeated = repeatedConclusionLines(lines, fenced, report.conclusion)
  const boilerplate = lines.flatMap((line, index) =>
    !fenced[index] && isBoilerplateLine(line) ? [index] : [],
  )
  const dropped = new Set([...repeated, ...boilerplate])
  const headings = emptyHeadingLines(lines, fenced, dropped)

  return dropped.size + headings.length === 0
    ? report.body
    : withoutLines(lines, fenced, new Set([...dropped, ...headings]))
}

/**
 * 前置き・締めの定型。内容を持たないことが文面だけで決まる行だけを、行ぜんぶとの一致で
 * 落とす（末尾の句点・感嘆符は見ない）。「〜を見てみます」のような型で当てる判定は置かない
 * ——型に当てると中身のある行まで黙って消え、消えたことに誰も気付けない。
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

/** フェンスの開き（CommonMark。行頭の空白は3つまで、`` ` `` か `~` を3つ以上）。 */
const FENCE_OPEN = /^ {0,3}(`{3,}|~{3,})/

/**
 * 行ごとに、フェンスに属するか（開き・中身・閉じのどれか）。閉じの無いフェンスは末尾まで続く。
 */
function fencedLineFlags(lines: readonly string[]): readonly boolean[] {
  const initial: { readonly flags: readonly boolean[]; readonly marker: string | undefined } = {
    flags: [],
    marker: undefined,
  }
  return lines.reduce((state, line) => {
    if (state.marker !== undefined) {
      return {
        flags: [...state.flags, true],
        marker: closesFence(line, state.marker) ? undefined : state.marker,
      }
    }
    const opening = FENCE_OPEN.exec(line)?.[1]
    return { flags: [...state.flags, opening !== undefined], marker: opening }
  }, initial).flags
}

/** フェンスの閉じか（開きと同じ文字を、開き以上の数だけ並べた行）。 */
function closesFence(line: string, marker: string): boolean {
  const trimmed = line.trim()
  return (
    /^ {0,3}\S/.test(line) &&
    trimmed.length >= marker.length &&
    [...trimmed].every((char) => char === marker[0])
  )
}

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
