import { describe, expect, it } from "bun:test"
import { join } from "node:path"

import { selectTranscriptTarget } from "../src/transcript-target.ts"

// 手で書いた架空のパス。実物の transcript は使わない（docs/coding-standards.md「会話内容の扱い」）。
const SIDECAR_CWD = "/work/tsukumo"

/** hook が書いた追従先ファイル1つ分。既定の書き込み時刻は、順序が関係ないテスト用。 */
function targetFile(transcriptPath: string, cwd: string, writtenAtMs = 0) {
  return { content: JSON.stringify({ transcriptPath, cwd }), writtenAtMs }
}

describe("selectTranscriptTarget", () => {
  it("同じディレクトリで始まったセッションのものは追う", () => {
    const content = targetFile("/projects/tsukumo/session.jsonl", SIDECAR_CWD)

    expect(selectTranscriptTarget([content], SIDECAR_CWD)).toEqual({
      kind: "follow",
      path: "/projects/tsukumo/session.jsonl",
    })
  })

  it("サイドカーの cwd の配下で始まったセッションのものも追う", () => {
    const content = targetFile("/projects/tsukumo/session.jsonl", join(SIDECAR_CWD, "src"))

    expect(selectTranscriptTarget([content], SIDECAR_CWD)).toEqual({
      kind: "follow",
      path: "/projects/tsukumo/session.jsonl",
    })
  })

  it("別のディレクトリで始まったセッションのものは追わず、どこのものかを返す", () => {
    const content = targetFile("/projects/other/session.jsonl", "/work/other-repo")

    expect(selectTranscriptTarget([content], SIDECAR_CWD)).toEqual({
      kind: "other-cwd",
      cwd: "/work/other-repo",
    })
  })

  it("cwd が前方一致するだけの別ディレクトリは追わない", () => {
    const content = targetFile("/projects/other/session.jsonl", `${SIDECAR_CWD}-old`)

    expect(selectTranscriptTarget([content], SIDECAR_CWD)).toEqual({
      kind: "other-cwd",
      cwd: `${SIDECAR_CWD}-old`,
    })
  })

  it("別のディレクトリのファイルがあっても、自分のディレクトリのものを選ぶ（奪われない）", () => {
    const candidates = [
      targetFile("/projects/other/session.jsonl", "/work/other-repo", 200),
      targetFile("/projects/tsukumo/session.jsonl", SIDECAR_CWD, 100),
    ]

    expect(selectTranscriptTarget(candidates, SIDECAR_CWD)).toEqual({
      kind: "follow",
      path: "/projects/tsukumo/session.jsonl",
    })
  })

  it("自分のディレクトリのものが複数あるときは、いちばん新しく書かれたものを選ぶ", () => {
    const candidates = [
      targetFile("/projects/tsukumo/old.jsonl", SIDECAR_CWD, 100),
      targetFile("/projects/tsukumo/new.jsonl", join(SIDECAR_CWD, "src"), 300),
      targetFile("/projects/tsukumo/mid.jsonl", SIDECAR_CWD, 200),
    ]

    expect(selectTranscriptTarget(candidates, SIDECAR_CWD)).toEqual({
      kind: "follow",
      path: "/projects/tsukumo/new.jsonl",
    })
  })

  it("ファイルが1つも無いときは missing", () => {
    expect(selectTranscriptTarget([], SIDECAR_CWD)).toEqual({ kind: "missing" })
  })

  it("JSON として読めないときは missing", () => {
    expect(
      selectTranscriptTarget([{ content: "{壊れている", writtenAtMs: 0 }], SIDECAR_CWD),
    ).toEqual({ kind: "missing" })
  })

  it("cwd を持たない（パスだけを書いた）古い形式は missing", () => {
    expect(
      selectTranscriptTarget(
        [{ content: "/projects/tsukumo/session.jsonl\n", writtenAtMs: 0 }],
        SIDECAR_CWD,
      ),
    ).toEqual({
      kind: "missing",
    })
  })

  it("transcriptPath や cwd が文字列でない・空のときは missing", () => {
    expect(selectTranscriptTarget([targetFile("", SIDECAR_CWD)], SIDECAR_CWD)).toEqual({
      kind: "missing",
    })
    expect(
      selectTranscriptTarget(
        [{ content: '{"transcriptPath":42,"cwd":"/work"}', writtenAtMs: 0 }],
        SIDECAR_CWD,
      ),
    ).toEqual({
      kind: "missing",
    })
    expect(
      selectTranscriptTarget(
        [{ content: '{"transcriptPath":"/a/b.jsonl"}', writtenAtMs: 0 }],
        SIDECAR_CWD,
      ),
    ).toEqual({
      kind: "missing",
    })
  })
})
