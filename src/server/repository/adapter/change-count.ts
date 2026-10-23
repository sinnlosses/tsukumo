// 変更の札を数えるための git の口（`ChangeCountGit`）を、作業ディレクトリ1つに向けて作る。
// 打つのは `rev-parse HEAD`・`merge-base --is-ancestor`・`diff --numstat`・`log`・`show --numstat` だけで、出力は数えずに返す。
// `git diff --numstat <HEAD>` は未追跡のファイルを出さないので、それは数えない。

import type {
  ChangeCountGit,
  CommitListOutput,
  GitHead,
  NumstatOutput,
} from "../../core/change-count-git.ts"
import { runGit } from "./git.ts"

export function changeCountGitOf(cwd: string): ChangeCountGit {
  return {
    readHead: () => readHead(cwd),
    diffNumstatSince: (head) => diffNumstatSince(cwd, head),
    commitsSince: (head) => commitsSince(cwd, head),
    numstatOfCommit: (sha) => numstatOfCommit(cwd, sha),
  }
}

/** いまの HEAD のコミット。読めなければ undefined。 */
export async function readHeadSha(cwd: string): Promise<string | undefined> {
  const head = await readHead(cwd)
  return head.kind === "known" ? head.sha : undefined
}

async function readHead(cwd: string): Promise<GitHead> {
  const outcome = await runGit(cwd, ["rev-parse", "--verify", "HEAD"])
  const sha = outcome.kind === "output" ? outcome.stdout.trim() : ""
  return sha === "" ? { kind: "unknown" } : { kind: "known", sha }
}

/** 控えた HEAD がいまの HEAD の祖先のときだけ差分を出す（`--is-ancestor` は祖先でないと非0で、打てないときと同じ `failed` になる）。 */
async function diffNumstatSince(cwd: string, head: string): Promise<NumstatOutput> {
  if (!(await isAncestorOfHead(cwd, head))) {
    return { kind: "unavailable" }
  }
  const diff = await runGit(cwd, ["diff", "--numstat", head, "--"])
  return diff.kind === "output" ? { kind: "output", text: diff.stdout } : { kind: "unavailable" }
}

async function commitsSince(cwd: string, head: string): Promise<CommitListOutput> {
  if (!(await isAncestorOfHead(cwd, head))) {
    return { kind: "unavailable" }
  }
  const log = await runGit(cwd, ["log", "--format=%H%x09%s", `${head}..HEAD`, "--"])
  if (log.kind !== "output") {
    return { kind: "unavailable" }
  }
  const commits = log.stdout
    .split("\n")
    .filter((line) => line !== "")
    .map((line) => {
      const separator = line.indexOf("\t")
      return { sha: line.slice(0, separator), subject: line.slice(separator + 1) }
    })
  return { kind: "output", commits }
}

async function numstatOfCommit(cwd: string, sha: string): Promise<NumstatOutput> {
  const show = await runGit(cwd, ["show", "--numstat", "--format=", sha, "--"])
  return show.kind === "output" ? { kind: "output", text: show.stdout } : { kind: "unavailable" }
}

async function isAncestorOfHead(cwd: string, sha: string): Promise<boolean> {
  const ancestor = await runGit(cwd, ["merge-base", "--is-ancestor", sha, "HEAD"])
  return ancestor.kind === "output"
}
