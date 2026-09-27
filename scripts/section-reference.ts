// 正典の節を「ファイル名＋番号＋「句」」の形で引いている参照（`docs/display.md`「吹き出し」の
// ように、句の前に番号を挟むこともある形）を拾い、句が参照先のファイルに文字として残っているかを
// 照らす純粋関数。
//
// 拾う形は「ファイル名 → 閉じのバッククォート（あってもなくても）→ 番号（`4.2` / `7章` /
// `原則4`。無くてもよい）→ `の`（無くてもよい）→ 「句」」だけ。あいだに他の語が挟まるもの
// （ファイル名 7章）。人格の「…」、のように「」が節を指していないもの）は拾わない。
// ファイル名の無い「同ファイル「…」」と、`CLAUDE.md` の中で節を `## 節名` の形で指すものは、
// 指す先が文脈でしか決まらないので追わない。
//
// 参照を探すのは `docs/history/`（据え置きの記録）・`docs/research/`（調査した時点の正典を引いた
// 記録で、覆すと決めた句をそのまま引いていることがある）・`develop/`（タスク本文と作業の記録）の
// 外だけ。句を探す相手からは `docs/history/` だけを外す（`docs/research/` は正典から引かれる）。
//
// 照合は「参照先のファイルに句が含まれるか」で、見出しに限らない（本文の句を引く正当な参照が
// 多いため）。行の折り返し・空白・バッククォート・`` の有無の違いは両側から除いて比べる。
//
// 「」の無い素のパス（`docs/` 以下の `.md`）は、句を照らせないのでファイルの実在だけを照らす。
// こちらは `docs/history/` を指すものも照らす。

/** ソース中の参照1つ。 */
export type SectionReference = {
  /** 参照を書いているファイル（リポジトリ直下からの相対パス）。 */
  readonly sourcePath: string
  /** 参照が始まる行（1始まり）。 */
  readonly line: number
  /** 引いている先（`docs/display.md` / `CLAUDE.md` の形）。 */
  readonly targetPath: string
  /** 「」の中身（行をまたいでいたら、継続行のコメント記号と字下げを除いて繋いだもの）。 */
  readonly phrase: string
}

/** ソース中の、`docs/` 以下の `.md` を指すパス1つ（「句」の有無を問わない）。 */
export type FileReference = {
  /** パスを書いているファイル（リポジトリ直下からの相対パス）。 */
  readonly sourcePath: string
  /** パスのある行（1始まり）。 */
  readonly line: number
  /** 指している先（`docs/display.md` の形）。 */
  readonly targetPath: string
}

/** 照らした結果、参照先に句が見つからなかったもの。 */
export type StrayReference = SectionReference & {
  /** 参照先そのものが読めなかった（ファイルが無い）かどうか。 */
  readonly targetMissing: boolean
}

// 句を探す相手から外すファイル。
const RECORD_PREFIXES = ["docs/history/"] as const satisfies readonly string[]

// 参照を探す対象から外すファイル。
const UNSCANNED_PREFIXES = [
  ...RECORD_PREFIXES,
  "docs/research/",
  "develop/",
] as const satisfies readonly string[]

// ファイル名・閉じのバッククォート・番号・「の」のあとに「 が来る形。`docs/` 配下はサブディレクトリ
// （`docs/research/`）も含む。`CLAUDE.md` は直前が `/` や英数字でないもの（別の場所の CLAUDE.md を
// 指していない）だけ。
const REFERENCE_HEAD =
  /(?<![\w/.-])((?:docs\/[a-z0-9-]+(?:\/[a-z0-9-]+)*|CLAUDE)\.md)`?[ \t]*(?:(?:\d+(?:\.\d+)*章?|原則\d+)[ \t]*)?の?[ \t]*「/gu

// 上と同じ頭だが、「 が無いまま行が終わる形。「 の開きそのものが次の行にある参照を拾うために使う。
const REFERENCE_HEAD_WITHOUT_BRACKET =
  /(?<![\w/.-])((?:docs\/[a-z0-9-]+(?:\/[a-z0-9-]+)*|CLAUDE)\.md)`?[ \t]*(?:(?:\d+(?:\.\d+)*章?|原則\d+)[ \t]*)?の?[ \t]*$/u

// `docs/` 以下の `.md` のパス。直前が `/` や英数字のもの（URL や別のリポジトリの中のパス）は拾わない。
const FILE_PATH = /(?<![\w/.-])docs\/[a-z0-9-]+(?:\/[a-z0-9-]+)*\.md(?![\w-])/gu

// 素のパスのうち、実在を照らさないもの（パスの完全一致）。
const UNCHECKED_FILE_PATHS = new Set<string>([
  // claude-skills のリポジトリのファイル。
  "docs/task-workflow-redesign.md",
  // 参照を拾う検査のテストが使う架空のパス。
  "docs/gone.md",
  "docs/research/topic.md",
  "docs/note.md",
])

// 句が閉じずに行が終わったとき、次の何行まで追うか（それより長い句は書き損じとみなして捨てる）。
const MAX_CONTINUATION_LINES = 3

// 継続行の頭にあるコメント記号・引用記号と字下げ。
const CONTINUATION_PREFIX = /^[ \t]*(?:\/\/+|\*|#+|>)?[ \t]*/u

/**
 * ファイル1つの本文から、節を引いている参照をすべて拾う。
 */
export function findSectionReferences(sourcePath: string, text: string): SectionReference[] {
  const lines = text.split("\n")
  return lines.flatMap((lineText, index) => [
    ...[...lineText.matchAll(REFERENCE_HEAD)].flatMap((match) =>
      toReference(
        sourcePath,
        index + 1,
        match[1],
        lineText.slice(match.index + match[0].length),
        lines.slice(index + 1, index + 1 + MAX_CONTINUATION_LINES),
      ),
    ),
    ...findReferenceAcrossLineBreak(sourcePath, lines, index, lineText),
  ])
}

/**
 * パス（と番号・「の」）で行が終わり、次の行の頭（継続行の記号を除いたあと）が「で始まる形を拾う。
 */
function findReferenceAcrossLineBreak(
  sourcePath: string,
  lines: readonly string[],
  index: number,
  lineText: string,
): SectionReference[] {
  const nextLine = lines[index + 1]
  if (nextLine === undefined) {
    return []
  }
  const strippedNextLine = nextLine.replace(CONTINUATION_PREFIX, "")
  if (!strippedNextLine.startsWith("「")) {
    return []
  }
  const match = REFERENCE_HEAD_WITHOUT_BRACKET.exec(lineText)
  if (match === null) {
    return []
  }
  return toReference(
    sourcePath,
    index + 1,
    match[1],
    strippedNextLine.slice("「".length),
    lines.slice(index + 2, index + 2 + MAX_CONTINUATION_LINES),
  )
}

/** 一致から参照を1つ組み立てる。参照先が無い・記録先・句が読めない・空のときは捨てる。 */
function toReference(
  sourcePath: string,
  line: number,
  targetPath: string | undefined,
  afterOpen: string,
  continuation: readonly string[],
): SectionReference[] {
  if (targetPath === undefined || isRecord(targetPath)) {
    return []
  }
  const phrase = readPhrase(afterOpen, continuation)
  if (phrase === undefined || phrase.length === 0) {
    return []
  }
  return [{ sourcePath, line, targetPath, phrase }]
}

/**
 * 参照のうち、句が参照先に見つからないものを返す。`targets` は参照先のパスから本文への対応で、
 * 無いパスは「参照先が無い」として返す。
 */
export function findStrayReferences(
  references: readonly SectionReference[],
  targets: ReadonlyMap<string, string>,
): StrayReference[] {
  const normalizedTargets = new Map(
    [...targets].map(([path, text]) => [path, normalizeForMatch(text)] as const),
  )
  return references.flatMap((reference): StrayReference[] => {
    const target = normalizedTargets.get(reference.targetPath)
    if (target === undefined) {
      return [{ ...reference, targetMissing: true }]
    }
    return target.includes(normalizeForMatch(withoutTrailingEllipsis(reference.phrase)))
      ? []
      : [{ ...reference, targetMissing: false }]
  })
}

/**
 * ファイル1つの本文から、`docs/` 以下の `.md` を指すパスをすべて拾う（実在を照らさないものは除く）。
 */
export function findFileReferences(sourcePath: string, text: string): FileReference[] {
  return text.split("\n").flatMap((lineText, index) =>
    [...lineText.matchAll(FILE_PATH)]
      .map((match) => match[0])
      .filter((targetPath) => !UNCHECKED_FILE_PATHS.has(targetPath))
      .map((targetPath) => ({ sourcePath, line: index + 1, targetPath })),
  )
}

/** パスのうち、`existingPaths` に無いファイルを指すものを返す。 */
export function findMissingFileReferences(
  references: readonly FileReference[],
  existingPaths: ReadonlySet<string>,
): FileReference[] {
  return references.filter((reference) => !existingPaths.has(reference.targetPath))
}

/** 無いファイルを指すパス1つを、一覧に出す1行にする。 */
export function formatMissingFileReference(reference: FileReference): string {
  return `${reference.sourcePath}:${reference.line}: ${reference.targetPath}（ファイルが無い）`
}

/** 迷子の参照1つを、一覧に出す1行にする。 */
export function formatStrayReference(stray: StrayReference): string {
  const reason = stray.targetMissing ? "（参照先が無い）" : ""
  return `${stray.sourcePath}:${stray.line}: ${stray.targetPath}「${stray.phrase}」${reason}`
}

/** 参照を拾う対象にするかどうか（記録は外す）。パスはリポジトリ直下からの相対。 */
export function isScannedSource(path: string): boolean {
  return !UNSCANNED_PREFIXES.some((prefix) => path.startsWith(prefix))
}

function isRecord(path: string): boolean {
  return RECORD_PREFIXES.some((prefix) => path.startsWith(prefix))
}

/**
 * 「 の直後から、対になる 」までを読む（句の中の「」は入れ子として数える）。行内で閉じなければ
 * 継続行を繋いで読む。閉じなければ `undefined`。
 */
function readPhrase(afterOpen: string, continuation: readonly string[]): string | undefined {
  const text = [
    afterOpen,
    ...continuation.map((line) => line.replace(CONTINUATION_PREFIX, "")),
  ].join("")
  const close = findClosingBracket(text)
  return close === undefined ? undefined : text.slice(0, close)
}

/** 深さ1から数え始め、深さが0になる 」の位置を返す。 */
function findClosingBracket(text: string): number | undefined {
  const characters = [...text]
  const found = characters.reduce<{
    readonly depth: number
    readonly offset: number
    readonly at: number | undefined
  }>(
    (state, character) => {
      if (state.at !== undefined) {
        return state
      }
      const depth =
        character === "「" ? state.depth + 1 : character === "」" ? state.depth - 1 : state.depth
      return {
        depth,
        offset: state.offset + character.length,
        at: depth === 0 ? state.offset : undefined,
      }
    },
    { depth: 1, offset: 0, at: undefined },
  )
  return found.at
}

/** 句の末尾の「…」（後ろを略した印）を外す。略した句は前半だけで照らす。 */
function withoutTrailingEllipsis(phrase: string): string {
  return phrase.replace(/(?:…|\.\.\.)+$/u, "")
}

/** 折り返し・空白・バッククォート・強調の `` を除く（両側を同じ形に揃えて比べるため）。 */
function normalizeForMatch(text: string): string {
  return text.replace(/\s+/gu, "").replace(/`/gu, "").replace(/\*\*/gu, "")
}
