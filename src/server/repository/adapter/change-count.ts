// 変更の札を数えるための git の口（`ChangeCountGit`）を、作業ディレクトリ1つに向けて作る。
// 打つのは `rev-parse HEAD`・`merge-base --is-ancestor`・`diff --numstat` だけで、出力は数えずに返す。
// `git diff --numstat <HEAD>` は未追跡のファイルを出さないので、それは数えない。

import type { ChangeCountGit, GitHead, NumstatOutput } from "../../core/change-count-git.ts"
import { runGit } from "./git.ts"

export function changeCountGitOf(cwd: string): ChangeCountGit {
  return {
    readHead: () => readHead(cwd),
    diffNumstatSince: (head) => diffNumstatSince(cwd, head),
  }
}

async function readHead(cwd: string): Promise<GitHead> {
  const outcome = await runGit(cwd, ["rev-parse", "--verify", "HEAD"])
  const sha = outcome.kind === "output" ? outcome.stdout.trim() : ""
  return sha === "" ? { kind: "unknown" } : { kind: "known", sha }
}

/** 控えた HEAD がいまの HEAD の祖先のときだけ差分を出す（`--is-ancestor` は祖先でないと非0で、打てないときと同じ `failed` になる）。 */
async function diffNumstatSince(cwd: string, head: string): Promise<NumstatOutput> {
  const ancestor = await runGit(cwd, ["merge-base", "--is-ancestor", head, "HEAD"])
  if (ancestor.kind !== "output") {
    return { kind: "unavailable" }
  }
  const diff = await runGit(cwd, ["diff", "--numstat", head, "--"])
  return diff.kind === "output" ? { kind: "output", text: diff.stdout } : { kind: "unavailable" }
}
