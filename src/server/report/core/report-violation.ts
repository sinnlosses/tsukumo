// `report` ツールで受け取ったレポートの検査（「検査 → 整形 → 描画」の検査の段。
// docs/display.md 4.2「出力の分離（セリフと詳細）」）。
//
// **検査するのは「レポートの記法」（`report-notation.ts`）の条のうち、機械で判定できるものだけ。**
// 読み手によって結論が変わる条（効能書き・根拠の量・前置きと締めの行など）は入れない
// ——誤って差し戻すと、直しようのない指摘でモデルを1往復させることになる。
//
// 本文は Markdown として構文解析せず、行で見る（フェンスの中だけは飛ばす）。描く側の
// パーサ（`src/browser/`）とは層が違って使えず、判定に要るのは行頭の形と数えられる印だけなので。

/** 検査にかけるレポート。`body` と `favor` の「無い」は空の文字列。 */
export type ReportDraft = {
  readonly conclusion: string
  readonly body: string
  readonly favor: string
}

/**
 * 規約違反1つ。`count` は違反の数（文の数・塊の数）で、**モデルが書いた文面は持たない**
 * （差し戻しの文面に写さないため。会話の中身をモデルの文脈へ戻す経路を作らない）。
 */
export type ReportViolation =
  /** `conclusion` が3文以上ある（条1「冒頭の1〜2文で結論」）。 */
  | { readonly kind: "long-conclusion"; readonly count: number }
  /** `body` に4文以上の地の文の段落がある（「地の文の段落は3文まで」）。`count` は段落の数。 */
  | { readonly kind: "long-paragraph"; readonly count: number }
  /** `body` に `#` の見出しがある（条9）。 */
  | { readonly kind: "top-heading"; readonly count: number }
  /** 直前の行が太字1行でない表がある（「表には直前の1行で見出しを付ける」）。 */
  | { readonly kind: "untitled-table"; readonly count: number }
  /** mermaid の図に、規約が挙げる10種の外の種類がある。 */
  | { readonly kind: "unknown-mermaid"; readonly count: number }
  /** お願い以外の `note` の塊が3つ以上ある（「5種あわせて1〜2個まで」）。 */
  | { readonly kind: "too-many-notes"; readonly count: number }
  /** `body` にお願いの塊（`note-favor`）がある（お願いは `favor` に入れる）。 */
  | { readonly kind: "favor-in-body"; readonly count: number }

/** レポートの規約違反を並べる。空なら違反は無い。 */
export function reportViolations(report: ReportDraft): readonly ReportViolation[] {
  const { outside: lines, fences } = splitFences(report.body)
  const noteClasses = noteClassLists(lines)

  const counted = [
    { kind: "long-conclusion", count: sentenceCount(report.conclusion) },
    {
      kind: "long-paragraph",
      count: paragraphs(lines).filter((paragraph) => sentenceCount(paragraph) > 3).length,
    },
    { kind: "top-heading", count: lines.filter((line) => TOP_HEADING.test(line)).length },
    { kind: "untitled-table", count: untitledTableCount(lines) },
    {
      kind: "unknown-mermaid",
      count: fences.filter(
        (fence) => fence.info === "mermaid" && !MERMAID_KINDS.has(mermaidKind(fence.content)),
      ).length,
    },
    {
      kind: "too-many-notes",
      count: noteClasses.filter((classes) => !classes.includes("note-favor")).length,
    },
    {
      kind: "favor-in-body",
      count: noteClasses.filter((classes) => classes.includes("note-favor")).length,
    },
  ] as const satisfies readonly ReportViolation[]

  return counted.filter((violation) => violation.count > VIOLATION_THRESHOLDS[violation.kind])
}

/**
 * 差し戻すときの `report` の戻り値。**違反した条と直し方だけ**を1行ずつ並べ、画面の状態
 * （描けたか・どこに出たか）は載せない（docs/display.md 4.2）。モデルの文脈に戻るので短くする。
 */
export function reportRejectionText(violations: readonly ReportViolation[]): string {
  return [
    "レポートの記法の規約に次の違反がある。直して `report` を呼び直すこと:",
    ...violations.map((violation) => `- ${violationLine(violation)}`),
  ].join("\n")
}

/** 違反にしない上限（これを超えたら違反）。 */
const VIOLATION_THRESHOLDS = {
  "long-conclusion": 2,
  "long-paragraph": 0,
  "top-heading": 0,
  "untitled-table": 0,
  "unknown-mermaid": 0,
  "too-many-notes": 2,
  "favor-in-body": 0,
} as const satisfies Record<ReportViolation["kind"], number>

function violationLine(violation: ReportViolation): string {
  switch (violation.kind) {
    case "long-conclusion":
      return `\`conclusion\` が${violation.count}文ある。2文以内にし、残りは \`body\` へ移す`
    case "long-paragraph":
      return `4文以上の地の文の段落が${violation.count}個ある。表・箇条書き・\`<details>\` へ移す`
    case "top-heading":
      return "`#` の見出しがある。`##` / `###` にする"
    case "untitled-table":
      return `見出しの無い表が${violation.count}個ある。表の直前の行に太字1行で見出しを付ける`
    case "unknown-mermaid":
      return `mermaid の図に規約の10種の外の種類が${violation.count}個ある。10種から選ぶ（迷ったら flowchart）`
    case "too-many-notes":
      return `\`note\` の塊が${violation.count}個ある。お願いを除いて1〜2個まで減らす`
    case "favor-in-body":
      return "`body` にお願いの塊（`note-favor`）がある。`favor` へ移す"
  }
}

/**
 * 規約が挙げる mermaid の種類（`report-notation.ts` の表の2行）。**文面と揃っていること**は
 * `test/server/report/core/report-violation.test.ts` が見る。
 */
const MERMAID_KINDS: ReadonlySet<string> = new Set([
  "flowchart",
  "sequenceDiagram",
  "stateDiagram-v2",
  "classDiagram",
  "erDiagram",
  "mindmap",
  "timeline",
  "gantt",
  "gitGraph",
  "quadrantChart",
])

/** `#` 1つの見出し（CommonMark の ATX 見出し。行頭の空白は3つまで）。 */
const TOP_HEADING = /^ {0,3}#(?:[ \t]|$)/

/** フェンスの開き（CommonMark。行頭の空白は3つまで、`` ` `` か `~` を3つ以上）。 */
const FENCE_OPEN = /^ {0,3}(`{3,}|~{3,})(.*)$/

/** 表の区切りの行（`| --- | :---: |`）。`|` を1つ以上含み、セルは `-` と両端の `:` だけ。 */
const TABLE_DELIMITER = /^ *\|?(?: *:?-+:? *\|)+(?: *:?-+:? *)?$|^ *:?-+:? *\|(?: *:?-+:? *\|?)*$/

/** 太字だけの1行（表の見出し）。 */
const BOLD_LINE = /^ *\*\*[^*].*\*\* *$/

/** 地の文の段落にしない行の頭（見出し・表・引用・箇条書き・番号・HTML・区切り線）。 */
const NON_PROSE_LINE = /^ *(?:#|\||>|[-*+] |\d+[.)] |<|---|\*\*\*|___)/

/** HTML の塊の開き・閉じ（入れ子の深さを数える要素）。 */
const HTML_BLOCK_OPEN = /<(?:details|div)\b/g
const HTML_BLOCK_CLOSE = /<\/(?:details|div)>/g

/** フェンス1つ。`info` は開きの info 文字列の最初の語（無ければ空）。 */
type Fence = { readonly info: string; readonly content: readonly string[] }

/**
 * 本文を、フェンスの外の行とフェンスの並びに分ける。`outside` は**行の並びを保つ**ため、
 * フェンスの行（開き・中身・閉じ）を空行に置き換えて残す。閉じの無いフェンスは末尾まで続く。
 */
function splitFences(body: string): {
  readonly outside: readonly string[]
  readonly fences: readonly Fence[]
} {
  type Open = {
    readonly marker: string
    readonly info: string
    readonly content: readonly string[]
  }
  const initial: {
    readonly outside: readonly string[]
    readonly fences: readonly Fence[]
    readonly open: Open | undefined
  } = { outside: [], fences: [], open: undefined }

  const final = body.split("\n").reduce((state, line) => {
    const open = state.open
    if (open !== undefined) {
      return closesFence(line, open.marker)
        ? {
            outside: [...state.outside, ""],
            fences: [...state.fences, { info: open.info, content: open.content }],
            open: undefined,
          }
        : {
            ...state,
            outside: [...state.outside, ""],
            open: { ...open, content: [...open.content, line] },
          }
    }
    const opening = FENCE_OPEN.exec(line)
    if (opening === null) {
      return { ...state, outside: [...state.outside, line] }
    }
    return {
      ...state,
      outside: [...state.outside, ""],
      open: {
        marker: opening[1] ?? "```",
        info: (opening[2] ?? "").trim().split(/\s+/)[0] ?? "",
        content: [],
      },
    }
  }, initial)

  return final.open === undefined
    ? { outside: final.outside, fences: final.fences }
    : {
        outside: final.outside,
        fences: [...final.fences, { info: final.open.info, content: final.open.content }],
      }
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
 * 地の文の段落。**HTML の塊（`<details>` / `<div>`）の中は数えない**（4文以上の段落の逃げ先が
 * `<details>` なので）。段落は空行か、地の文でない行で切れる。
 */
function paragraphs(lines: readonly string[]): readonly string[] {
  const initial: {
    readonly done: readonly string[]
    readonly current: readonly string[]
    readonly depth: number
  } = { done: [], current: [], depth: 0 }

  const flushed = (state: typeof initial): readonly string[] =>
    state.current.length === 0 ? state.done : [...state.done, state.current.join("")]

  const final = lines.reduce((state, line) => {
    const depth = Math.max(
      state.depth + countMatches(line, HTML_BLOCK_OPEN) - countMatches(line, HTML_BLOCK_CLOSE),
      0,
    )
    const prose =
      state.depth === 0 && depth === 0 && line.trim() !== "" && !NON_PROSE_LINE.test(line)
    return prose
      ? { ...state, current: [...state.current, line.trim()], depth }
      : { done: flushed(state), current: [], depth }
  }, initial)

  return flushed(final)
}

/**
 * 文の数。句点（`。` `！` `？`）で数え、句点で終わらない末尾も1文と数える。**inline code と
 * 全角の丸括弧の中は数えない**（括弧の中の句点で文を割らない）。
 */
function sentenceCount(text: string): number {
  const plain = text
    .replace(/`[^`\n]*`/g, "")
    .replace(/（[^（）]*）/g, "")
    .trim()
  if (plain === "") {
    return 0
  }
  const terminated = countMatches(plain, /[。！？]+/g)
  return /[。！？]$/.test(plain) ? terminated : terminated + 1
}

/** 表のうち、直前の空でない行が太字1行でないものの数。 */
function untitledTableCount(lines: readonly string[]): number {
  return lines.filter((line, index) => {
    const next = lines[index + 1]
    if (next === undefined || !line.includes("|") || !TABLE_DELIMITER.test(next)) {
      return false
    }
    const previous = lines.slice(0, index).findLast((candidate) => candidate.trim() !== "")
    return previous === undefined || !BOLD_LINE.test(previous)
  }).length
}

/**
 * mermaid の図の種類（中身の最初の語）。空行・`%%` の行（コメントと init の指定）と、先頭の
 * `---` で囲んだ設定は飛ばす。中身が空なら空文字（10種に無いので違反になる）。
 */
function mermaidKind(content: readonly string[]): string {
  const lines = content.map((line) => line.trim())
  const afterFrontmatter =
    lines.find((line) => line !== "") === "---"
      ? lines.slice(lines.indexOf("---", lines.indexOf("---") + 1) + 1)
      : lines
  const first = afterFrontmatter.find((line) => line !== "" && !line.startsWith("%%"))
  return first?.split(/\s/)[0] ?? ""
}

/** `note` の塊ごとの class の並び（`class="note note-warn"` なら `["note", "note-warn"]`）。 */
function noteClassLists(lines: readonly string[]): readonly (readonly string[])[] {
  return lines.flatMap((line) =>
    [...line.matchAll(/class=["']([^"']*)["']/g)]
      .map((match) => (match[1] ?? "").split(/\s+/))
      .filter((classes) => classes.includes("note")),
  )
}

function countMatches(text: string, pattern: RegExp): number {
  return [...text.matchAll(pattern)].length
}
