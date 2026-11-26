// 自動判定（auto mode の分類器）に拒否されたツールの呼び出し1件の語彙。
// 拒否の文（SDK の `message`）と呼び出しの入力は会話の内容そのもの（書き換え後の入力が入る）なので、ここには載せない。
// 入力は駆動の側が一度だけの許可の照合にだけ使う。

/** 拒否1件。`toolUseId` は拒否された呼び出しの SDK の `tool_use_id` で、画面からの答えの `id` にもなる。 */
export type PermissionDenial = {
  readonly toolUseId: string
  readonly toolName: string
  /** 判定した側が付けた理由を {@link MAX_DENIAL_REASON_LENGTH} 字で切ったもの。 */
  readonly reason: string
  /** サブエージェントの中の呼び出しのときだけ、そのサブエージェントの id。 */
  readonly agentId?: string
}

/** 状態に積んだ拒否1件。`deniedAt` は届いた時刻（エポックミリ秒。サーバがイベントに打った時刻）。 */
export type StampedPermissionDenial = PermissionDenial & { readonly deniedAt: number }

export const MAX_DENIAL_REASON_LENGTH = 200
