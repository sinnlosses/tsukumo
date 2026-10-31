import { setImmediate } from "node:timers/promises"

/**
 * フックの判定の前に、列に積まれたメッセージが `relayMessages` の反復へ渡るのを待つ。
 * SDK はフックの呼び出し（制御リクエスト）を読んだその場で処理し、それより前に届いたメッセージは列に積んで反復へ渡す。
 * 待たないと、同じ瞬間に届いたはずの返却・本文が判定に反映されない。
 * 列を空けるのは microtask だけなので、macrotask を1回待てば足りる。
 */
export async function waitForQueuedMessages(): Promise<void> {
  await setImmediate()
}
