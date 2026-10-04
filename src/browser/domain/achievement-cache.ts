// 成果の画面のキャッシュを、日記が書き上がったことを受けて取り直させる。

import { queryClient } from "./query-client.ts"
import { rpc } from "./rpc.ts"

/** 書いた日と見ている日が違っても広く無効化する。 */
export function invalidateAchievement(): void {
  void queryClient.invalidateQueries({ queryKey: rpc.achievement.key() })
}
