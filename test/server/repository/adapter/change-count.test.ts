import { mkdtempSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { describe, expect, it } from "vitest"

import {
  changeCountGitOf,
  readHeadSha,
} from "../../../../src/server/repository/adapter/change-count.ts"
import { runSubprocessOrThrow } from "../../../fixture/subprocess.ts"

// ここは本物の `git` を一時のリポジトリで起こす（打つ引数と祖先の判定そのものが検査の対象）。

const IDENTITY = ["-c", "user.name=架空", "-c", "user.email=fictional@example.invalid"]

async function git(cwd: string, args: readonly string[]): Promise<void> {
  await runSubprocessOrThrow("git", [...IDENTITY, ...args], { cwd })
}

/** 1つコミットした一時のリポジトリ。 */
async function repositoryWithCommit(): Promise<string> {
  const repository = mkdtempSync(join(tmpdir(), "tsukumo-change-count-"))
  await git(repository, ["init", "--quiet"])
  writeFileSync(join(repository, "a.txt"), "1\n2\n3\n")
  await git(repository, ["add", "a.txt"])
  await git(repository, ["commit", "--quiet", "-m", "架空の頭"])
  return repository
}

describe("changeCountGitOf", () => {
  it("控えた HEAD からのコミットと未コミットの変更を numstat で出す", async () => {
    const repository = await repositoryWithCommit()
    const port = changeCountGitOf(repository)
    const head = await port.readHead()
    writeFileSync(join(repository, "b.txt"), "x\n")
    await git(repository, ["add", "b.txt"])
    await git(repository, ["commit", "--quiet", "-m", "架空の続き"])
    writeFileSync(join(repository, "a.txt"), "1\n")

    expect(head.kind).toBe("known")
    const output = head.kind === "known" ? await port.diffNumstatSince(head.sha) : undefined
    expect(output).toEqual({ kind: "output", text: "0\t2\ta.txt\n1\t0\tb.txt\n" })
  })

  it("控えた HEAD がいまの HEAD の祖先でなければ unavailable", async () => {
    const repository = await repositoryWithCommit()
    const port = changeCountGitOf(repository)
    const head = await port.readHead()
    await git(repository, ["checkout", "--quiet", "--orphan", "fictional-other"])
    await git(repository, ["commit", "--quiet", "-m", "架空の別の根"])

    const output = head.kind === "known" ? await port.diffNumstatSince(head.sha) : undefined
    expect(output).toEqual({ kind: "unavailable" })
  })

  it("控えた HEAD より後のコミットを新しい順に SHA と件名で出し、そのコミットだけの numstat を引ける", async () => {
    const repository = await repositoryWithCommit()
    const port = changeCountGitOf(repository)
    const head = await port.readHead()
    writeFileSync(join(repository, "b.txt"), "x\n")
    await git(repository, ["add", "b.txt"])
    await git(repository, ["commit", "--quiet", "-m", "架空の一歩目"])
    writeFileSync(join(repository, "a.txt"), "1\n")
    await git(repository, ["add", "a.txt"])
    await git(repository, ["commit", "--quiet", "-m", "架空の二歩目"])

    const commits = head.kind === "known" ? await port.commitsSince(head.sha) : undefined
    expect(commits?.kind).toBe("output")
    const listed = commits?.kind === "output" ? commits.commits : []
    expect(listed.map((commit) => commit.subject)).toEqual(["架空の二歩目", "架空の一歩目"])
    expect(await port.numstatOfCommit(listed[1]?.sha ?? "")).toEqual({
      kind: "output",
      text: "1\t0\tb.txt\n",
    })
  })

  it("控えた HEAD がいまの HEAD の祖先でなければ、コミットの一覧も unavailable", async () => {
    const repository = await repositoryWithCommit()
    const port = changeCountGitOf(repository)
    const head = await port.readHead()
    await git(repository, ["checkout", "--quiet", "--orphan", "fictional-other"])
    await git(repository, ["commit", "--quiet", "-m", "架空の別の根"])

    const commits = head.kind === "known" ? await port.commitsSince(head.sha) : undefined
    expect(commits).toEqual({ kind: "unavailable" })
  })

  it("git リポジトリでなければ HEAD は unknown", async () => {
    const outside = mkdtempSync(join(tmpdir(), "tsukumo-change-count-outside-"))

    expect(await changeCountGitOf(outside).readHead()).toEqual({ kind: "unknown" })
    expect(await readHeadSha(outside)).toBeUndefined()
  })

  it("readHeadSha はコミットのあるリポジトリで HEAD の sha を返す", async () => {
    const repository = await repositoryWithCommit()
    const head = await changeCountGitOf(repository).readHead()

    expect(head.kind === "known" ? head.sha : undefined).toBe(await readHeadSha(repository))
    expect(await readHeadSha(repository)).toMatch(/^[0-9a-f]{40}$/u)
  })
})
