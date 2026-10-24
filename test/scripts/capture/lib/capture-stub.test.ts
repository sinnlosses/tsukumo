import { describe, expect, test } from "vitest"

import {
  isStubbedCall,
  readRpcStub,
  rpcPathOf,
} from "../../../../scripts/capture/lib/capture-stub.ts"

describe("readRpcStub", () => {
  test("範囲が無ければ全回の差し替えで、本体は JSON のまま", () => {
    expect(readRpcStub('planUsage.report={"kind":"not-applicable"}')).toEqual({
      procedure: "planUsage.report",
      range: undefined,
      body: { kind: "not-applicable" },
    })
  })

  test("@3 は3回目だけ", () => {
    expect(readRpcStub('planUsage.report@3={"kind":"unavailable"}')?.range).toEqual({
      from: 3,
      to: 3,
    })
  })

  test("@1-2 は1回目から2回目まで", () => {
    expect(readRpcStub('planUsage.report@1-2={"kind":"unavailable"}')?.range).toEqual({
      from: 1,
      to: 2,
    })
  })

  test("本体に = を含む JSON も読める", () => {
    expect(readRpcStub('a.b={"text":"x=y"}')?.body).toEqual({ text: "x=y" })
  })

  test.each([
    ["範囲が0", 'planUsage.report@0={"kind":"unavailable"}'],
    ["範囲が逆順", 'planUsage.report@2-1={"kind":"unavailable"}'],
    ["範囲が数字でない", 'planUsage.report@a={"kind":"unavailable"}'],
    ["= が無い", "planUsage.report"],
    ["JSON が壊れている", "planUsage.report={kind"],
    ["手続きが空", '={"kind":"unavailable"}'],
    ["手続きが空で範囲だけ", '@1={"kind":"unavailable"}'],
  ])("読めない値は undefined: %s", (_name, value) => {
    expect(readRpcStub(value)).toBeUndefined()
  })
})

describe("isStubbedCall", () => {
  test("範囲 1-2 は1・2回目が入り、3回目は入らない", () => {
    const range = { from: 1, to: 2 }
    expect([1, 2, 3].map((callNumber) => isStubbedCall(range, callNumber))).toEqual([
      true,
      true,
      false,
    ])
  })

  test("範囲が無ければどの回も入る", () => {
    expect(isStubbedCall(undefined, 99)).toBe(true)
  })
})

describe("rpcPathOf", () => {
  test("ドットをスラッシュに直す", () => {
    expect(rpcPathOf("planUsage.report")).toBe("planUsage/report")
    expect(rpcPathOf("a.b.c")).toBe("a/b/c")
  })
})
