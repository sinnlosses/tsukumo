import { commandSuggestions } from "../../../../shared/session/command-suggestion.ts"
import { useSession } from "../../../stores/session.ts"
import { runDestinationOf, type RunDestination } from "../domain/run-destination.ts"

/** 「tsukumo に頼む」の文面のひな形の送り先が、いまのセッションのコマンドに在るか。入力欄の `/` 補完と同じ一覧で判定する。 */
export function useRunDestination(template: string): RunDestination {
  const slashCommands = useSession((session) => session.state.slashCommands)
  const commandDescriptions = useSession((session) => session.state.commandDescriptions)
  return runDestinationOf(template, commandSuggestions(slashCommands, commandDescriptions))
}
