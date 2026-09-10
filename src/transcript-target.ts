// hook（hooks/state.sh）が SessionStart で書き出す追従先ファイルの中身を読み、サイドカーが追う
// べき transcript を決める。「決める」層で、ファイルI/Oは持たない（読むのは src/index.ts）。
//
// **同じディレクトリで始まったセッションだけを追う。** 追従先ファイルは全セッション共通の1つで、
// 最後に SessionStart した claude が上書きしていく。cwd を見ずに乗り換えると、別のリポジトリで
// claude を起動した瞬間にビューがそちらへ移る（docs/architecture.md
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

/**
 * 追従先ファイルの中身から、`sidecarCwd` で動いているサイドカーが追うべき transcript を決める。
 * セッションの cwd がサイドカーの cwd と同じか、その配下にあるときだけ追う
 * （リポジトリ直下でサイドカーを動かし、サブディレクトリで claude を起動する使い方を通すため）。
 */
export function selectTranscriptTarget(
  content: string | undefined,
  sidecarCwd: string,
): TranscriptTargetSelection {
  const target = content === undefined ? undefined : parseTranscriptTarget(content)
  if (target === undefined) {
    return { kind: "missing" }
  }

  return isWithin(sidecarCwd, target.cwd)
    ? { kind: "follow", path: target.path }
    : { kind: "other-cwd", cwd: target.cwd }
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
