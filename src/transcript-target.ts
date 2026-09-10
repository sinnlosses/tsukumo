// hook（hooks/state.sh）が SessionStart で書き出す追従先ファイルの中身を読み、サイドカーが追う
// べき transcript を決める。「決める」層で、ファイルI/Oは持たない（読むのは src/index.ts）。
//
// **同じディレクトリで始まったセッションだけを追う。** hook は**セッションの cwd ごとに別の
// ファイル**へ書く（`~/.tsukumo/targets/<cwdのスラッグ>`）。1つのファイルを共有していた頃は、
// 別のリポジトリで claude を起動した瞬間にそちらへ上書きされ、**このディレクトリのサイドカーが
// 起動すらできなくなった**（2026-09-11 に実際に踏んだ）。ファイルを分けると互いに奪い合わない。
//
// それでも cwd を検証するのは、**スラッグ化の規則を読む側が信用しない**ため。ファイル名ではなく
// 中身に書かれた cwd で判定する（docs/architecture.md
// 「追従先は自前でスラッグ化せず、hookが書いたパスを読む」）。
//
// 中身は hook（外部）が書くので構造を信用しない。unknown で受けて検証し、壊れているときは
// 「無い」と同じ扱いに倒す（src/state.ts と同じ方針）。

import { isAbsolute, relative } from "node:path"

/**
 * 追従先の判定結果。**`follow` 以外は「追わない」**で、起動時は前提不足として終了し、
 * 追従中は今の追従先を変えない理由になる。
 */
export type TranscriptTargetSelection =
  | { readonly kind: "follow"; readonly path: string }
  // ファイルが無い・空・形式が読めない（cwd を持たない旧形式を含む）。
  | { readonly kind: "missing" }
  // 別のディレクトリで始まったセッションが書いたもの。どこのものかは利用者に伝える。
  | { readonly kind: "other-cwd"; readonly cwd: string }

/** hook が書いた追従先ファイル1つ分。`writtenAtMs` は新しいものを選ぶための最終更新時刻。 */
export type TranscriptTargetCandidate = {
  readonly content: string
  readonly writtenAtMs: number
}

/**
 * hook が書いた追従先ファイル群から、`sidecarCwd` で動いているサイドカーが追うべき transcript を
 * 決める。セッションの cwd がサイドカーの cwd と同じか、その配下にあるものだけを候補にし、
 * **その中でいちばん新しく書かれたもの**を採る（リポジトリ直下でサイドカーを動かし、
 * サブディレクトリで claude を起動する使い方も通る）。
 *
 * 候補が1つも無いときは、**他のディレクトリのものがあればそれを伝える**（利用者に
 * 「どこのセッションしか見つからなかったか」を見せるため）。
 */
export function selectTranscriptTarget(
  candidates: readonly TranscriptTargetCandidate[],
  sidecarCwd: string,
): TranscriptTargetSelection {
  const targets = candidates.flatMap((candidate) => {
    const target = parseTranscriptTarget(candidate.content)
    return target === undefined ? [] : [{ ...target, writtenAtMs: candidate.writtenAtMs }]
  })
  const newestFirst = [...targets].sort((a, b) => b.writtenAtMs - a.writtenAtMs)

  const mine = newestFirst.find((target) => isWithin(sidecarCwd, target.cwd))
  if (mine !== undefined) {
    return { kind: "follow", path: mine.path }
  }

  const other = newestFirst[0]
  return other === undefined ? { kind: "missing" } : { kind: "other-cwd", cwd: other.cwd }
}

type TranscriptTarget = {
  readonly path: string
  readonly cwd: string
}

function parseTranscriptTarget(content: string): TranscriptTarget | undefined {
  let parsed: unknown
  try {
    parsed = JSON.parse(content)
  } catch {
    return undefined
  }

  if (!isRecord(parsed)) {
    return undefined
  }

  const path = parsed.transcriptPath
  const cwd = parsed.cwd
  if (typeof path !== "string" || path === "" || typeof cwd !== "string" || cwd === "") {
    return undefined
  }

  return { path, cwd }
}

/** `target` が `baseDir` と同じか、その配下にあるか。 */
function isWithin(baseDir: string, target: string): boolean {
  const rel = relative(baseDir, target)
  return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel))
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}
