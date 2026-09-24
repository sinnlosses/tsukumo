// 誰が訪ねてくるか・どの台本で話すか（`docs/design.md` 5章「訪問の契機と状態」）。純関数だけで、
// パックの一覧を読むのも乱数を振るのも呼び出し側。
//
// 客になれるのは**`character.json` に `visit` を持ち、台本（`visit.scripts`）が1本以上ある
// パックだけ**（台本を作れないパックは来ない。`docs/research/character-visit.md` 論点2・論点4）。
// あるじと同じパックは来ない。候補が複数なら来るたびに等しい確率で1つ選ぶ。

import { type CharacterVisit, type VisitScript } from "../../shared/character-visit.ts"

/** 客になれるパック（名前と `visit` の節）。 */
export type VisitGuest = { readonly pack: string; readonly visit: CharacterVisit }

/**
 * 客の候補を探す元のパック（adapter の `CharacterPack` のうち、ここが読む部分だけ）。
 * `definition` が無い（`character.json` が読めない）パックもそのまま渡してよい。
 */
export type VisitGuestSource = {
  readonly name: string
  readonly definition: { readonly visit: CharacterVisit | undefined } | undefined
}

/** 来ることになった客と、話す台本と帰りの一言。候補が居なければ `none`（来ない）。 */
export type VisitChoice =
  | { readonly kind: "none" }
  | {
      readonly kind: "chosen"
      readonly guest: string
      readonly script: VisitScript
      readonly farewell: string
    }

/** パックの一覧から客になれるものを拾う。 */
export function visitGuests(packs: readonly VisitGuestSource[]): readonly VisitGuest[] {
  return packs.flatMap((pack) => {
    const visit = pack.definition?.visit
    return visit !== undefined && visit.scripts.length > 0 ? [{ pack: pack.name, visit }] : []
  })
}

/**
 * あるじ（`host`）を除いた候補から客を1人選び、その客の台本と帰りの一言を1つずつ選ぶ。
 * `random` は 0 以上 1 未満を返す（`Math.random` と同じ約束）。
 */
export function chooseVisit(
  guests: readonly VisitGuest[],
  host: string,
  random: () => number,
): VisitChoice {
  const guest = pick(
    guests.filter((candidate) => candidate.pack !== host),
    random,
  )
  if (guest === undefined) {
    return { kind: "none" }
  }
  const script = pick(guest.visit.scripts, random)
  const farewell = pick(guest.visit.farewell, random)
  return script === undefined || farewell === undefined
    ? { kind: "none" }
    : { kind: "chosen", guest: guest.pack, script, farewell }
}

/** 並びから1つ選ぶ（空なら undefined。添字の「無い」をそのまま返す）。 */
function pick<T>(items: readonly T[], random: () => number) {
  return items[Math.min(Math.floor(random() * items.length), items.length - 1)]
}
