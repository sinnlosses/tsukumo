import { useSession } from "../../../stores/session.ts"

/** タスクを頼む口の語。名前が無いパックでは入力欄の薄い字と同じく、名前を使わずに操作だけを言う。 */
export function useAskLabel(): string {
  const characterName = useSession((session) => session.state.character?.name)
  return characterName === undefined ? "頼む" : `${characterName} に頼む`
}
