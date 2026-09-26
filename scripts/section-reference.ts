// 正典の節を「ファイル名＋番号＋「句」」の形で引いている参照（`docs/display.md` 4.2「吹き出し」
// など）を拾い、句が参照先のファイルに文字として残っているかを照らす純粋関数。
// `scripts/find-stray-reference.ts`（一覧を出す入口）と `test/section-reference.test.ts`
// （リポジトリ全体で0件を保つテスト）が使う。
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

// 句が閉じずに行が終わったとき、次の何行まで追うか（それより長い句は書き損じとみなして捨てる）。
const MAX_CONTINUATION_LINES = 3

// 継続行の頭にあるコメント記号・引用記号と字下げ。
const CONTINUATION_PREFIX = /^[ \t]*(?:\/\/+|\*|#+|>)?[ \t]*/u

/**
 * ファイル1つの本文から、節を引いている参照をすべて拾う。
 */
export function findSectionReferences(sourcePath: string, text: string): SectionReference[] {
  const lines = text.split("\n")
  return lines.flatMap((lineText, index) =>
    [...lineText.matchAll(REFERENCE_HEAD)].flatMap((match) => {
      const targetPath = match[1]
      if (targetPath === undefined || isRecord(targetPath)) {
        return []
      }
      const afterOpen = lineText.slice(match.index + match[0].length)
      const phrase = readPhrase(
        afterOpen,
        lines.slice(index + 1, index + 1 + MAX_CONTINUATION_LINES),
      )
      if (phrase === undefined || phrase.length === 0) {
        return []
      }
      return [{ sourcePath, line: index + 1, targetPath, phrase }]
    }),
  )
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
