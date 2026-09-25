// 全機能のコマンドの受け手の表を1枚に束ねる配線（`docs/design.md` 2章「コマンドの受け手と手続きの
// 置き方」）。**「どの種類をどの機能が受けるか」の答えはこのファイル**で、行の中身と断る条件は
// 各機能の `<機能>/core/<機能>-command.ts` にある。束ねるのを `session/core/` でなくここに置くのは、
// 機能どうしの辺（`session` → `usage-review` / `host`）を増やさないため。

import {
  type CharacterPackCommandPorts,
  characterPackCommands,
} from "./server/character-pack/core/character-pack-command.ts"
import { type ChatCommandPorts, chatCommands } from "./server/chat/core/chat-command.ts"
import { type HostCommandPorts, hostCommands } from "./server/host/core/host-command.ts"
import { type CommandRoute } from "./server/session/core/command-dispatch.ts"
import { type SessionCommandPorts, sessionCommands } from "./server/session/core/session-command.ts"
import {
  type UsageReviewCommandPorts,
  usageReviewCommands,
} from "./server/usage-review/core/usage-review-command.ts"
import { type VisitCommandPorts, visitCommands } from "./server/visit/core/visit-command.ts"

/** 機能ごとの書き込み口（中身は配線が選んで渡す）。 */
export type CommandRoutePorts = {
  readonly session: SessionCommandPorts
  readonly characterPack: CharacterPackCommandPorts
  readonly chat: ChatCommandPorts
  readonly visit: VisitCommandPorts
  readonly usageReview: UsageReviewCommandPorts
  readonly host: HostCommandPorts
}

/** 全機能の表を1枚に束ねる（28種の網羅は `satisfies CommandRoute` が型で見る）。 */
export function commandRoute(ports: CommandRoutePorts): CommandRoute {
  return {
    ...sessionCommands(ports.session),
    ...characterPackCommands(ports.characterPack),
    ...chatCommands(ports.chat),
    ...visitCommands(ports.visit),
    ...usageReviewCommands(ports.usageReview),
    ...hostCommands(ports.host),
  } satisfies CommandRoute
}
