// 書いている途中の `report` の草稿で、まだ届いていない部品の形。

/**
 * 書いている途中の草稿で、親に名指されたのにまだ届いていない部品。
 * `next` は次に届く見込みの部品の ID（届いていない部品のうち、紙の順で先頭）。描く側は、この場所にだけ骨組みを置く。全部届いていれば無い。
 * `openSections` は根の子のうち、自分か子孫がまだ届いていないもの（内容部品が届く前でも、届いた節は見出しを先に出す）。
 * 書いていない草稿（伏せている記録・差し戻されて保留の草稿）は `next` が無く、`openSections` は空。
 */
export type MainViewDraftPending = {
  readonly next?: string
  readonly openSections: readonly string[]
}
