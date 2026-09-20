// どのキャラクターパックを出すかの判断だけ（docs/design.md 7章・13.6）。**パックの中身を
// 読むのも一覧を作るのも外の世界に触る仕事**なので、それは `src/server/adapter/character-pack.ts` に
// あり、ここは渡された一覧を名前で引くだけの純粋関数を持つ。
//
// 名前で引くのは、**名前をパスとして組み立てないため**。一覧に無い名前は必ず既定へ落ちる。

/**
 * 名前で選べるもの。**`core` はキャラクターパックの中身を知らない**（立ち絵も人格も
 * `src/server/adapter/character-pack.ts` の `CharacterPack` が持つ）ので、選ぶのに要る一片だけを見る。
 */
export type NamedCharacterPack = { readonly name: string }

/** 起動時の初期パックを決めるのに要るもの。 */
export type InitialCharacterPackOptions<Pack extends NamedCharacterPack> = {
  /** いま選べるパックの一覧。 */
  readonly packs: readonly Pack[]
  /** どれにも当たらなかったときのパック（同梱の既定、または指定から読んだもの）。 */
  readonly fallback: Pack
  /**
   * その回の指定（`TSUKUMO_CHARACTER`）。**値そのものは使わない** — 指定があるときは
   * すでに `fallback` がそこから読まれているので、「あるか無いか」だけを見る。
   */
  readonly specified: string | undefined
  /** 前回に画面から選んで覚えたパックの名前を読む（実装は `src/server/adapter/remembered-character.ts`）。 */
  readonly readRemembered: () => string | undefined
}

/**
 * 起動時の初期パック。優先順位は **その回の指定（`TSUKUMO_CHARACTER`）> 覚えた値 > 同梱の既定**
 * （docs/design.md 13.6「第3の扱い」）。
 *
 * 指定があるときは覚えた値を**読みに行かない**。環境変数は「その回の上書き」なので、覚えた値を
 * 上書きも参照もしない（覚えるのは画面から選んだときだけ）。
 */
export function selectInitialCharacterPack<Pack extends NamedCharacterPack>(
  options: InitialCharacterPackOptions<Pack>,
): Pack {
  return options.specified === undefined
    ? selectCharacterPack(options.packs, options.fallback, options.readRemembered())
    : options.fallback
}

/**
 * 一覧から名前でパックを引く。**知らない名前は既定へ落ちる**（画面から届いた名前も、覚えた値も、
 * 一覧に無ければ同じ扱い。docs/design.md 7章）。
 */
export function selectCharacterPack<Pack extends NamedCharacterPack>(
  packs: readonly Pack[],
  fallback: Pack,
  name: string | undefined,
): Pack {
  return packs.find((pack) => pack.name === name) ?? fallback
}
