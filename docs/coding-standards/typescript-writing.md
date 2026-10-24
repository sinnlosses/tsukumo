# コーディング規約: TypeScript の書き方

ステータス: **正典**。入口は `docs/coding-standards.md`（規約の理由と例外の入口と、子のファイルの一覧）。

責務: 関数の並び順・イミュータブル・キャスト・remeda・clsx・`satisfies`・`Date` を使わない・識別子と用語集の、理由と例外を持つ。
読む時: TypeScript の書き方の規約の理由と例外（`.claude/rules/typescript.md` の行の括弧の節）を確かめたいとき。
直す時: これらの規約の理由・例外を変えたとき、lint やテストが検査する範囲を変えたとき。

## 節の索引

| 節                                          | 中身                                                                                                    |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| ## 関数の並び順                             | 「外から使うもの → 内部で使うもの」に並べる理由                                                         |
| ### テストのためだけに公開しない            | 公開関数の振る舞い経由で検証する理由                                                                    |
| ## 変数は基本イミュータブル                 | 再代入・可変コレクションを避ける理由                                                                    |
| ## 型を迂回するキャストを使わない           | 迂回が必要になったら型のほうを直す                                                                      |
| ### テストの DOM 要素のキャスト             | `test/**` を落とす lint の範囲、`typedElement` への置き換え、`src` に掛けなかった理由、残った例外の基準 |
| ## 可読性が良くなる場合は remeda を優先する | 手書きの `reduce`・比較関数などを remeda に寄せる基準と、寄せないものの線引き                           |
| ## class 名は clsx で組む                   | `className` を配列の `join` やテンプレート文字列で組まず clsx に渡す理由と、使わなくてよい場面          |
| ## 型注釈より `satisfies`                   | リテラルの型を保ったまま形だけ検査する理由                                                              |
| ## `Date` を使わない                        | 時刻は `Temporal` で扱う理由と、`no-restricted-globals` での検査                                        |
| ## 識別子は用語集に合わせる                 | コードの識別子を `docs/glossary.md` の英語識別子に合わせ、変えるなら用語集を先に直す                    |

## 関数の並び順

ファイル内で「外から使うもの → その内部で使うもの」の順に並べ、`export` された関数を上に、
そこからしか呼ばれない非公開関数を下に置く。非公開関数同士は呼ばれる順に並べる。

機械が検査するのは「`export` する関数は、`export` しない関数より前に並ぶ」だけで、
`test/function-order.test.ts` が `src/` と `scripts/` のテスト以外のソースを読んで落とす。
数えるのは行頭に字下げの無い関数宣言と、`const` に入れた関数式・アロー関数（`memo(…)` などで包んだものは数えない）。
非公開関数同士の並びは検査の外で、レビューが見る。

読む人がファイルを開いて最初に目にするのが、そのファイルの公開インターフェースになるように
するため。目次を別に置かなくてもファイルの先頭が目次として働く。

### テストのためだけに公開しない

非公開関数は、`export` された関数の振る舞いを通して検証する。テストのために `export` すると、
「このファイルの公開インターフェース」がテストの都合で膨らみ、上の並び順の意味も崩れる。

`src/`・`scripts/` の export は `test/architecture/test-only-export.test.ts` がテストからしか import されないものを、
`test/architecture/unused-export.test.ts` がどこからも import されないものを落とす。
本番の側の読み手は `test/` 以外と、vitest の `globalSetup`・`setupFiles` と文書の検査の入口（`DOCUMENT_CHECK_TEST_FILES`）。
型は、読まれる export の型注釈から名指されていれば数えない。
当たった関数・定数は許可リストに入れず、`export` を外して公開口経由で確かめるか、
公開口が実ブラウザ・git・標準入力などを要るなら純粋な部品を概念の名前のファイルへ移す。重なるテストは消す。
許可リストに理由を付けて置けるのは、テストだけが読む `<部品>Props` の型だけ（自己テストが縛る）。
同じファイルの中で使うなら export を外し、使わないなら消す。

テストのその他の規約（置き場所・モック・カバレッジ・消す/足すの判断）は下の「テスト」節。

## 変数は基本イミュータブル

再代入が必要に見える場合はまず、値を返す関数に切り出せないかを検討する。ループカウンタや、
例外処理で外側のスコープに結果を持ち出す必要があるなど、可変が自然な場合はその限りではない。

変数は基本 `const`。不変性はローカル変数だけでなくコレクションにも適用する
（`readonly` フィールド・`readonly T[]`・`ReadonlyMap`）。**引数として渡した入れ物が
呼び出し先で書き変わる契約にしない。** tsukumo は「読む → 決める → 描く」を繰り返す
ループなので、途中の入れ物が書き変わると「今フレームの入力」がどこにも残らなくなる
（`docs/architecture.md` 原則2）。

**状態を持つ入れ物（キャッシュなど）を配線から渡すときも同じ**——中の `Map` などを型に出して
呼び出し先に `.set` させず、作る側の閉包に閉じ込めて、覚える・引く口だけを渡す。
`src/server/achievement/adapter/closed-issue.ts` の `createAchievementCache()` が例（型は
`readBeads` の関数1つだけを持ち、前に読んだ結果とその印は閉包の中）。

## 型を迂回するキャストを使わない

次を書かない: `as` キャスト、`any`、非nullアサーション `!`、`@ts-expect-error` /
`@ts-ignore`。必要になったのは、**その値の型が実際の中身と合っていない**という合図なので、
迂回ではなく型のほうを直す。`any` は oxlint の `typescript/no-explicit-any` で error にしてある。

**唯一の逃げ道は「境界で検証してから内側の型に変換する」こと。** `unknown` で受けて検証関数を
通し、通った値だけを内側の型として返す。この変換関数の中でだけ、検証済みであることを根拠に
型を確定させてよい。

外部由来の値（transcript の1行、`character.json`、環境変数）は**構造が信用できない**
ので、境界で検証してから内側の型に変換する。検証を通っていない値が内側に入らないよう、
変換は1箇所の関数に封じ込める。

**「素のオブジェクトか」の判定は remeda の `isPlainObject` を使う**（2026-09-22。それまでは
8ファイルがそれぞれ `isRecord` を書き写していた）。**`isPlainObject` は prototype が
`Object.prototype` か `null` のものだけを通す**ので、`JSON.parse` の結果・SDK のメッセージ・
transcript の1行のような**外から来た素のデータ**に使う。捕まえた例外（`Error` の実体）のように
prototype を持つものを見るときだけ `isObjectType` で、`code` のようなフィールドは `in` で
確かめてから読む。

**パスに組む文字列など、検査を通ったことに意味がある値は、検査済みの branded な型
（`string & { readonly __brand: "…" }`）にして運ぶ。** 検査が `boolean` を返すだけだと、通っても
値は `string` のままで、門を通さずにパスを組む呼び出しを型が止めない。作れるのは
`parse…(value: string): … | undefined` の1つと、契約の入力に使う型述語（`value is …`）つきの
`refine` だけで、`as` では作らない。パスを組む関数はその型だけを受け、通らない値は境界で
`undefined` に畳んで内側へ運ばない。通らないときに「何もしない」を残すなら、配線の1か所で
検査して、何もしない口（`UNAVAILABLE_CHAT_SUMMARY` など）を渡し、core の引数に `| undefined` を
持ち込まない。テストでは `test/fixture/` の作り手（`parse…` を通し、
`undefined` なら throw する）で値を作る。例は `CharacterPackName`・`ItemId`・`DateKey`。

### テストの DOM 要素のキャスト

`test/**` では `typescript/consistent-type-assertions`（`assertionStyle: "never"`）を
`.oxlintrc.json` の `overrides` で有効にしてある。`as const` 以外の `as` キャスト（`any` 経由の
二段のものも含む）を全部落とす。`screen.getByLabelText(...) as HTMLSelectElement` のような、
クエリの戻り値を具体クラスとして扱うためのキャストが特に多かった（2026-09-26 時点で 15
ファイル・74 か所）。

**代わりに `test/typed-element.ts` の `typedElement(value, ctor, description)` を使う。**
`instanceof` で `ctor` のインスタンスであることを確かめてから返し、合わなければ
`description` を添えて投げる。前提（「この要素は `<select>` になっている」）が崩れたときに
`undefined` のまま先へ進んで**黙って通る**のではなく、その場で落ちて教える。

**`src/` にはこの規則を掛けていない。** `src/browser/components/page/conversation/components/markdown/renderer/` の `children as ReactNode`（react-markdown の型定義が要求する形）や
`src/shared/character-pack/character-background.ts` の `value as Record<string, unknown>`
（境界での検証はこの節の上の「唯一の逃げ道」どおりに1関数へ封じ込めてある）は、DOM 要素の
キャストとは性質が違う別の関心事なので、直す量に対して1つの規則で縛る効果が薄いと判断した。

DOM 要素の instanceof に絞れない、性質の違う `as` が `test/` の中にもいくつか残っている。
**扱いの基準**:

- **`unknown` を経由せずに annotation で書けるなら、キャストではなく型注釈にする。**
  `JSON.parse(line)` の戻り値を `unknown` として扱いたいだけなら
  `(line): unknown => JSON.parse(line)`、`readonly` なタプルを `readonly string[]` として
  扱いたいだけなら `const xs: readonly string[] = TUPLE` のように、代入先に注釈を置けば
  キャストなしで済む（`test/server/chat/adapter/chat-archive.test.ts` の `readLines` を
  ジェネリックにした例、`test/architecture/server-feature.test.ts` の `flatMap` のコールバックに戻り値の
  注釈を付けた例など）
- **構造が合わないだけなら、実際に合う値を作る。** `test/browser/domain/reveal/
brush-scroll.test.ts` は `getBoundingClientRect` の戻り値を `{ top, bottom } as unknown as
DOMRect` と偽装していたが、`DOMRect` はテスト環境（happy-dom）が持つ
  実物のクラスなので `new DOMRect(0, top, 0, bottom - top)` で本物を作れば済む。`NodeJS.
ErrnoException` も `new Error(...) as NodeJS.ErrnoException` ではなく
  `Object.assign(new Error(...), { code })` で構造ごと満たせる
- **`Reflect.get` / `Reflect.set` は動的なプロパティ名の読み書きに `as` が要らない。**
  `test/dom-setup.ts` が `globalThis` にテスト環境の合図を立てるのに使っている
  （`any` を経由する `Record<string, unknown>` への二段キャストの代わり）
- **それでも構造的に合わないものだけ、`// oxlint-disable-next-line
typescript/consistent-type-assertions` を理由のコメントと1組で残す。** `test/browser/
components/domain/portrait.test.tsx` の `fetch` のスタブ（`fetch` の実装のうち使う分しか
  持たない代役を差し込む。**構造的に合わない代役を許容するのが目的そのもの**なので、annotation
  にも実物の構築にも逃げられない）が唯一の例外

## 可読性が良くなる場合は remeda を優先する

手書きの `reduce` での合計・グループ分け・比較関数などは、remeda に同じ関数があれば
**可読性が良くなる場合**にそちらへ寄せる。基準は「案を選ぶときの指標」と同じで、
**行数の削減それ自体は理由にしない**。remeda は依存にある（`package.json`。2026-09-22 に
型ガードなどの一般的な小物として承認）。

**寄せないもの**（線引き）:

- **標準の慣用句で差が無いもの**: `[...new Set(xs)]`、`Array.from({ length })`、名前付きの
  関数に包んだ clamp など。remeda に置き換えても読みやすさが変わらないものは寄せない
- **戻り値の型が変わって呼び出し側まで直すことになるもの**: `Map` を返す集計を `Record` を
  返す `groupBy`・`countBy` に置き換える、など。呼び出し側の型まで連鎖して直す羽目になる
  置き換えは、「置き換えのための置き換え」になっていないかを疑う

**`utils/` を作る前に remeda にあるかを見る**という**置き場所**の判断は、`docs/architecture.md`
「`lib/` と `utils/` に置く基準」が正典（ここでは重複させない）。この節が扱うのは、
`utils/` に切り出すかどうかに関係なく、その場で書く `reduce`・比較関数などのインラインの
書き方の基準。

## class 名は clsx で組む

2つ以上の class 名をつないで `className` に渡すときは、配列の `.filter(...).join(" ")` や
テンプレート文字列で手で組まず、`clsx(...)` に渡す。clsx は依存にある（`package.json`。
2026-09-26 に承認）。

class 名を手で組むと、条件で落とす class を空文字に畳む三項演算子が混ざり、区切りの空白を
どちらが持つかも呼び出し側が気にすることになる。clsx は `undefined`・`false`・空文字を捨てて
空白でつなぐので、渡す側は並べるだけで済む。

- 条件付きの class は `cond && styles["x"]` の形で渡す。オブジェクト記法
  （`{ [styles["x"]]: cond }`）は使わず、書き方を1つにそろえる
- class 名が1つだけのとき（`className={styles["x"]}`）は包まない
- `components/ui/` の部品へ渡す `className` には clsx を使わず、`styles["…"]` の字面だけを渡す。
  2つ以上要るときは CSS Modules の `composes` で1クラスに畳む（前例は `character-create.module.css`）。
  理由と検査は `docs/architecture/browser.md` の「上書きは `className` の1つ」

## 型注釈より `satisfies`

定数・テーブル・設定オブジェクトの定義は、型注釈（`const x: T = …`）ではなく `satisfies` で
形を検査する。

```diff
-const PORTRAITS: Record<Expression, string | undefined> = { … }
+const PORTRAITS = { … } satisfies Record<Expression, string | undefined>
```

型注釈は値の型を `T` に**広げる**ので、どのキーが実際にあるか・どの文字列リテラルだったかが
その場で失われる。`satisfies` は `T` を満たすかどうかだけを検査し、値の型はリテラルのまま残す。
`Object.keys` で取り出したキーが `string` に潰れない、使っていないキーが型から見える、といった
差になって効く。

`as` の代替としても使う。「この形になっているはず」と言いたいだけなら `satisfies` で
**検査させる**（`as` は検査せずに黙らせる。上の「型を迂回するキャストを使わない」）。

例外は、値より先に型が必要なとき — 再帰的な型、関数の引数・戻り値、`useState<T>` のような
型引数。ここは注釈でよい。

定数の型注釈のうち、キーが `string`・`number` でなく、値が読み取り専用の入れ物（`ReadonlySet`・`ReadonlyArray`・
`ReadonlyMap`・`readonly` の配列）でない `Record`（`Readonly<…>`・`Partial<…>` で包んだものも）は、
`test/architecture/lint-rule.test.ts`「定数の Record の型注釈」が機械で検査する（`pnpm run check` から走る）。
値が読み取り専用の入れ物の表は、`satisfies` にすると値の型が書き換えられる `Set` などに戻るので、読み取り専用へ広げる注釈が要る（上の例外）。
キーが `string`・`number` の表は、値の型を広げる注釈が要る場面と見分けられないので検査しない。

## `Date` を使わない

時刻は `Date` ではなく `Temporal`（`Temporal.Now` / `Temporal.Instant` /
`Temporal.ZonedDateTime` / `Temporal.PlainDate` など）で扱う。`.oxlintrc.json` の
`no-restricted-globals` で `Date` を `error` にして検査する（`src` / `test` / `scripts` すべてが
対象）。

理由は `Date` のメソッドの多くがミュータブル（`setFullYear` などが自分自身を書き換える）で、
月が0始まりだったり、うるう年・タイムゾーンの計算を呼び出し側に押し付けたりする点。`Temporal`
はイミュータブルで、日付の計算・タイムゾーン付きの時刻・ISO 8601 の文字列化を1つの体系で
扱える。**時刻の数（`shared` を通る値）はこれまでどおりエポックミリ秒の数のまま持つ**
（`Temporal.Instant` そのものを `shared` に出さない）。数を作る場所はサーバが
`src/session-start.ts` の `now`、ブラウザが `src/browser/utils/clock.ts` の
`nowEpochMilliseconds()`。数を読み書き可能な日時に戻すときは
`Temporal.Instant.fromEpochMilliseconds(...)` を使う（`src/server/adapter/local-time.ts`）。

**例外は無い。** テストで固定の時刻を作るときも `Temporal.ZonedDateTime.from({ ..., timeZone })`
や `Temporal.PlainDate` を使い、偽の時計は `spyOn(Temporal.Now, "instant")` で差し替える
（`test/browser/components/page/conversation/components/chat-view/hooks/use-chat-view.test.tsx` /
`test/browser/components/page/conversation/components/dispatch/components/turn-status/turn-status.test.tsx`）。ファイルの mtime のように「エポック秒の
数をそのまま受け取れる」API（`node:fs` の `utimesSync` など）は `Date` を経由せず数を直接渡す。

## 識別子は用語集に合わせる

合わせる対象は `docs/glossary.md` の「英語識別子」（`英語識別子（予定）` を含む）。

用語集は日本語表記・英語識別子・定義を1つに決めて表記ゆれを防ぐための表で、
コードだけが別の名前を持つと、画面・文書・コードで同じものを指す言葉が割れる。
