// テストごとに空の一時ディレクトリを作り、テストが終わったら消す。

import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { afterEach, beforeEach } from "vitest"

/**
 * 呼んだ場所（ファイルの最上位か `describe` の中）の各テストの前に `tsukumo-<name>-` で始まる
 * 一時ディレクトリを作り、後で消す。返す関数は、いま走っているテストのディレクトリを返す。
 * 同じ場所で後から登録した `beforeEach` からも使える。
 */
export function useTempDir(name: string): () => string {
  let dir: string | undefined
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), `tsukumo-${name}-`))
  })
  afterEach(() => {
    if (dir !== undefined) {
      rmSync(dir, { recursive: true, force: true })
    }
    dir = undefined
  })
  return () => {
    if (dir === undefined) {
      throw new Error("一時ディレクトリはテストの中でだけ使える")
    }
    return dir
  }
}
