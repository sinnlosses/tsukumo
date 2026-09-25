// ブラウザ側の手続きの呼び出し（`src/browser/lib/rpc-client.ts`）を、`globalThis.fetch` の代役で
// 受ける。**サーバは起こさない**。代役が知っているのは oRPC の RPC の運び方（本文は
// `{ "json": <値> }`、失敗は状態コードと `{ "json": { defined, code, status, message } }`）だけで、
// どの手続きに何を返すかは呼ぶテストが決める。
//
// 返す値はすべて各テストが手で書いた架空のもの（docs/coding-standards.md「会話内容の扱い」）。

import { RPC_PATH } from "../../src/shared/rpc.ts"

/** 呼ばれた手続き1回ぶん（`procedure` は `tokenUsage/summary` のような `/rpc/` より後ろ）。 */
export type RpcCall = {
  readonly procedure: string
  readonly input: unknown
}

/** 代役の応答。`pending` は戻ってこない応答（「まだ届いていない」を測るため）。 */
export type RpcStubReply =
  | { readonly kind: "output"; readonly output: unknown }
  | { readonly kind: "error"; readonly status: number; readonly code: string }
  | { readonly kind: "pending" }

export function rpcOutput(output: unknown): RpcStubReply {
  return { kind: "output", output }
}

export function rpcError(status: number, code = "INTERNAL_SERVER_ERROR"): RpcStubReply {
  return { kind: "error", status, code }
}

export type RpcFetchStub = {
  /** ここまでに呼ばれた手続き（古い順）。 */
  readonly calls: () => readonly RpcCall[]
  /** `globalThis.fetch` を元に戻す（`afterEach` で呼ぶ）。 */
  readonly restore: () => void
}

/**
 * `globalThis.fetch` を手続きの代役に差し替える。`reply` は呼ばれるたびに引く（呼ばれた手続きと
 * 入力で応答を変えられる）。
 */
export function stubRpcFetch(reply: (call: RpcCall) => RpcStubReply): RpcFetchStub {
  const original = globalThis.fetch
  const calls: RpcCall[] = []
  const stub = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const request = new Request(input, init)
    const call = { procedure: procedureOf(request.url), input: await inputOf(request) }
    calls.push(call)
    return responseOf(reply(call))
  }
  globalThis.fetch = Object.assign(stub, { preconnect: original.preconnect })
  return {
    calls: () => [...calls],
    restore: () => {
      globalThis.fetch = original
    },
  }
}

function procedureOf(url: string): string {
  const pathname = new URL(url).pathname
  return pathname.startsWith(`${RPC_PATH}/`) ? pathname.slice(RPC_PATH.length + 1) : pathname
}

async function inputOf(request: Request): Promise<unknown> {
  const text = await request.text()
  if (text === "") {
    return undefined
  }
  const body: unknown = JSON.parse(text)
  return typeof body === "object" && body !== null && "json" in body ? body.json : undefined
}

function responseOf(reply: RpcStubReply): Promise<Response> {
  switch (reply.kind) {
    case "output":
      return Promise.resolve(jsonResponse(200, { json: reply.output }))
    case "error":
      return Promise.resolve(
        jsonResponse(reply.status, {
          json: { defined: false, code: reply.code, status: reply.status, message: "" },
        }),
      )
    case "pending":
      return new Promise(() => {})
  }
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  })
}
