// `--stub-rpc` の値を読み、手続きの応答を差し替える範囲の判定を行う。

import { positiveIntegerArgument } from "../../shared/positive-integer-argument.ts"

/** 呼び出しの何回目か（1から数える）の閉区間。 */
export interface StubRange {
  readonly from: number
  readonly to: number
}

/** `procedure` は契約の名前をドットでつないだもの。`range` が無いときは全部の呼び出し。 */
export interface RpcStub {
  readonly procedure: string
  readonly range: StubRange | undefined
  readonly body: unknown
}

const RANGE_PATTERN = /^(\d+)(?:-(\d+))?$/

/** `<手続き>[@<範囲>]=<JSON>` を読む。読めなければ undefined。 */
export function readRpcStub(value: string): RpcStub | undefined {
  const equalIndex = value.indexOf("=")
  if (equalIndex < 0) return undefined
  const target = value.slice(0, equalIndex)
  const body = parseJson(value.slice(equalIndex + 1))
  if (body === undefined) return undefined

  const atIndex = target.indexOf("@")
  const procedure = atIndex < 0 ? target : target.slice(0, atIndex)
  if (procedure === "") return undefined
  if (atIndex < 0) return { procedure, range: undefined, body: body.value }

  const range = readRange(target.slice(atIndex + 1))
  return range === undefined ? undefined : { procedure, range, body: body.value }
}

/** 呼び出し回数（1から数える）が差し替えの範囲に入るか。範囲が無ければ常に入る。 */
export function isStubbedCall(range: StubRange | undefined, callNumber: number): boolean {
  return range === undefined || (callNumber >= range.from && callNumber <= range.to)
}

/** 手続き名（`a.b.c`）を `/rpc/` 以降の URL の道筋（`a/b/c`）に直す。 */
export function rpcPathOf(procedure: string): string {
  return procedure.replaceAll(".", "/")
}

function parseJson(text: string): { readonly value: unknown } | undefined {
  try {
    return { value: JSON.parse(text) }
  } catch {
    return undefined
  }
}

function readRange(text: string): StubRange | undefined {
  const match = RANGE_PATTERN.exec(text)
  if (match === null) return undefined
  const from = positiveIntegerArgument.safeParse(match[1])
  if (!from.success) return undefined
  if (match[2] === undefined) return { from: from.data, to: from.data }
  const to = positiveIntegerArgument.safeParse(match[2])
  if (!to.success || to.data < from.data) return undefined
  return { from: from.data, to: to.data }
}
