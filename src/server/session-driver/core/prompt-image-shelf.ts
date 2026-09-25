// 依頼に添えた画像の**原寸の棚**（`docs/requirements.md` 4.10）。送った原寸を**直近の数枚だけ**
// プロセスのメモリに持ち、控えを押したブラウザへ `/prompt-image/<id>` で配れるようにする
// （配るのは `src/server/view-server/adapter/server.ts`、置くのと捨てる契機を決めるのは
// `src/server/session/core/session-manager.ts`）。
//
// **記録（`SessionState`）と `hello` には原寸を載せない。** 載るのは控えと id の組
// （`RecordedPromptImage`）だけで、原寸はここにしか無い。**ディスクには書かない**
// （会話の内容。docs/coding-standards.md「会話内容の扱い」）。
//
// 捨てる契機は2つ:
//   - 記録の窓（`MAX_SESSION_STATE_TURNS`）から依頼が落ちたとき（{@link releasedPromptImageIds}）
//   - 持っている原寸の合計の大きさが {@link MAX_SHELVED_PROMPT_IMAGE_BYTES} を超えたとき
//     （古いほうから）

import { type PromptImage, type RecordedPromptImage } from "../../../shared/prompt-image.ts"
import { type SessionRecord } from "../../../shared/session-state.ts"

/**
 * 棚に置く原寸の合計の大きさ（data URL の文字列の長さの合計）の上限。**なぜ枚数ではなく
 * 大きさか**: 枚数で切ると1枚の上限（5 MiB。`MAX_PROMPT_IMAGE_BYTES`）を基準にした最悪値で
 * 決めるしかなく、実際のスクリーンショット（1枚 0.5 MiB 前後）では天井のごく一部しか使わない
 * まま原寸が落ちる。大きさで切れば、小さい画像ほど多く残る。
 */
export const MAX_SHELVED_PROMPT_IMAGE_BYTES = 128 * 1024 * 1024

/** 棚に置いた1枚。原寸と控えの対に、棚が振った id を添えたもの（駆動へはこの形で渡す）。 */
export type ShelvedPromptImage = PromptImage & RecordedPromptImage

export type PromptImageShelf = {
  /**
   * 原寸を棚に置き、1枚ごとに id を振って返す（並びは受け取った順のまま）。合計の大きさが
   * 上限を超えるあいだ、いま置いた画像を除いて古いほうから捨てる。
   */
  readonly shelve: (images: readonly PromptImage[]) => readonly ShelvedPromptImage[]
  /** id が指す原寸の data URL。棚に無ければ undefined（配る側が 404 にする）。 */
  readonly find: (id: string) => string | undefined
  /** id の原寸を捨てる（棚に無い id は黙って無視する）。 */
  readonly release: (ids: readonly string[]) => void
}

export function createPromptImageShelf(): PromptImageShelf {
  // `Map` は入れた順を保つので、先頭がいちばん古い。
  const shelved = new Map<string, string>()

  return {
    shelve: (images) => {
      // 古いほうから捨てる対象は、いま置く前から棚にあった id だけ（挿入順で先頭側）。
      const previousIds = [...shelved.keys()]
      const entries = images.map((image) => ({ ...image, id: crypto.randomUUID() }))
      for (const entry of entries) {
        shelved.set(entry.id, entry.full)
      }
      let total = [...shelved.values()].reduce((sum, full) => sum + full.length, 0)
      for (const id of previousIds) {
        if (total <= MAX_SHELVED_PROMPT_IMAGE_BYTES) {
          break
        }
        const full = shelved.get(id)
        if (full === undefined) {
          continue
        }
        shelved.delete(id)
        total -= full.length
      }
      return entries
    },
    find: (id) => shelved.get(id),
    release: (ids) => {
      for (const id of ids) {
        shelved.delete(id)
      }
    },
  }
}

/**
 * 棚に置いた画像を、記録（`request` のイベント）に載せる形へ落とす。**原寸をここで外す**
 * ——駆動（本物も疑似も）はこれを通してから `request` を流すので、原寸が記録へ紛れ込む口が
 * 1つに決まる。
 */
export function recordedPromptImages(
  images: readonly ShelvedPromptImage[],
): readonly RecordedPromptImage[] {
  return images.map((image) => ({ id: image.id, thumbnail: image.thumbnail }))
}

/**
 * 記録が `before` から `after` へ変わったときに、**記録から消えた依頼の画像の id**。
 * 窓から古い依頼が落ちたとき・起こし直して記録が空に戻ったときに、その原寸を棚から捨てるのに使う。
 *
 * **「後の記録に無い id」ではなく「前にあって後に無い id」を返す。** 棚に置いてから `request` の
 * イベントが畳まれるまでの間は、その id がまだどちらの記録にも無い（その間に別のイベントが
 * 畳まれても、置いたばかりの原寸を捨てない）。
 */
export function releasedPromptImageIds(
  before: readonly SessionRecord[],
  after: readonly SessionRecord[],
): readonly string[] {
  const remaining = new Set(recordedPromptImageIds(after))
  return recordedPromptImageIds(before).filter((id) => !remaining.has(id))
}

function recordedPromptImageIds(records: readonly SessionRecord[]): readonly string[] {
  return records.flatMap((record) =>
    record.kind === "request" ? record.images.map((image) => image.id) : [],
  )
}
