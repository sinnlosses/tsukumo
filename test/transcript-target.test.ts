import { describe, expect, it } from "bun:test"
import { join } from "node:path"

import { selectTranscriptTarget } from "../src/transcript-target.ts"

// 手で書いた架空のパス。実物の transcript は使わない（docs/coding-standards.md「会話内容の扱い」）。
const SIDECAR_CWD = "/work/tsukumo"

function targetFile(transcriptPath: string, cwd: string): string {
  return JSON.stringify({ transcriptPath, cwd })
}

describe("selectTranscriptTarget", () => {
  it("同じディレクトリで始まったセッションのものは追う", () => {
    const content = targetFile("/projects/tsukumo/session.jsonl", SIDECAR_CWD)

    expect(selectTranscriptTarget(content, SIDECAR_CWD)).toEqual({
      kind: "follow",
      path: "/projects/tsukumo/session.jsonl",
    })
  })

  it("サイドカーの cwd の配下で始まったセッションのものも追う", () => {
    const content = targetFile("/projects/tsukumo/session.jsonl", join(SIDECAR_CWD, "src"))

    expect(selectTranscriptTarget(content, SIDECAR_CWD)).toEqual({
      kind: "follow",
      path: "/projects/tsukumo/session.jsonl",
    })
  })

  it("別のディレクトリで始まったセッションのものは追わず、どこのものかを返す", () => {
    const content = targetFile("/projects/other/session.jsonl", "/work/other-repo")

    expect(selectTranscriptTarget(content, SIDECAR_CWD)).toEqual({
      kind: "other-cwd",
      cwd: "/work/other-repo",
    })
  })

  it("cwd が前方一致するだけの別ディレクトリは追わない", () => {
    const content = targetFile("/projects/other/session.jsonl", `${SIDECAR_CWD}-old`)

    expect(selectTranscriptTarget(content, SIDECAR_CWD)).toEqual({
      kind: "other-cwd",
      cwd: `${SIDECAR_CWD}-old`,
    })
  })

  it("ファイルが無いときは missing", () => {
    expect(selectTranscriptTarget(undefined, SIDECAR_CWD)).toEqual({ kind: "missing" })
  })

  it("JSON として読めないときは missing", () => {
    expect(selectTranscriptTarget("{壊れている", SIDECAR_CWD)).toEqual({ kind: "missing" })
  })

  it("cwd を持たない（パスだけを書いた）古い形式は missing", () => {
    expect(selectTranscriptTarget("/projects/tsukumo/session.jsonl\n", SIDECAR_CWD)).toEqual({
      kind: "missing",
    })
  })

  it("transcriptPath や cwd が文字列でない・空のときは missing", () => {
    expect(selectTranscriptTarget(targetFile("", SIDECAR_CWD), SIDECAR_CWD)).toEqual({
      kind: "missing",
    })
    expect(selectTranscriptTarget('{"transcriptPath":42,"cwd":"/work"}', SIDECAR_CWD)).toEqual({
      kind: "missing",
    })
    expect(selectTranscriptTarget('{"transcriptPath":"/a/b.jsonl"}', SIDECAR_CWD)).toEqual({
      kind: "missing",
    })
  })
})
