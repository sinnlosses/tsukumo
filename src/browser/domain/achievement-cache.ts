// 成果の画面のキャッシュを、日記が書き上がったことを受けて取り直させる。

import { queryClient } from "../lib/query-client.ts"
import type { Rpc } from "../lib/rpc.ts"

/** 書いた日と見ている日が違っても広く無効化する。 */
export function invalidateAchievement(achievement: Rpc["achievement"]): void {
  void queryClient.invalidateQueries({ queryKey: achievement.key() })
}
