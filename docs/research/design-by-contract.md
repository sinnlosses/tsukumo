# 契約プログラミング（Design by Contract）と副作用の隔離

ステータス: 一次情報（調べた記録）。規約は変えない。取り入れる場合の論点は末尾の節に挙げ、決めるのは別の作業で行う。

問い: 事前条件・事後条件・不変条件に基づく設計と、副作用を隔離して純粋関数を保つ設計を、tsukumo のコーディング規約に取り入れるとき、何が既存の規約と重なり、何が足りないか。

## 1. 契約による設計の定義

### 1.1 三つの条件と表明

- 契約による設計は、システムを「互いの義務（契約）で相互作用を定めた部品の集まり」として見る方法である。[eiffel.com](https://www.eiffel.com/values/design-by-contract/introduction/)
- **事前条件**は、ルーチンを呼ぶ前に成り立っていなければならない条件で、呼ぶ側（顧客）が満たす。**事後条件**は、ルーチンが正常に終わったときに成り立つと保証する条件で、実装する側（供給者）が満たす。[eiffel.org](https://www.eiffel.org/doc/solutions/Design_by_Contract_and_Assertions)
- **クラス不変条件**は、クラスのすべての実体が生きている間ずっと成り立つ条件（その実体にとっての有効な状態）。どのルーチンを呼んでも保たれなければならない。[eiffel.org](https://www.eiffel.org/doc/solutions/Design_by_Contract_and_Assertions) [eiffel.com](https://www.eiffel.com/values/design-by-contract/introduction/)
- 表明（assertion）は、これらの条件を符号化した真偽式で、複数の節が論理積で結ばれる。事前条件が満たされて実行したルーチンは、事後条件が成り立つ状態で終わるか、事後条件違反の例外を起こす。[eiffel.org](https://www.eiffel.org/doc/solutions/Design_by_Contract_and_Assertions)
- Eiffel の表明の種類は、事前条件（require）・事後条件（ensure）・check・不変条件（invariant）・ループの表明。[eiffel.org](https://www.eiffel.org/doc/eiffelstudio/Assertion_Options)

### 1.2 供給者と顧客の責務分担

- 顧客の義務は事前条件を満たすこと、供給者の義務は事後条件を満たすこと。供給者の利益は、事前条件が成り立っていると仮定でき、契約の範囲の外には責任を負わないこと。[eiffel.com](https://www.eiffel.com/values/design-by-contract/introduction/)
- つまり事前条件に違反した呼び出しは、供給者ではなく呼び出し側のバグである。

### 1.3 防御的プログラミングとの違い

- Meyer は防御的プログラミングを、呼ぶ側が既に確かめた検査とも重なる検査を「できるだけ多く」入れる流儀として批判した。契約による設計は、重複した検査の代わりに、どちらが何を確かめるかを契約として決める。[ethz.ch（Meyer, Applying Design by Contract）](https://se.inf.ethz.ch/~meyer/publications/computer/contract.pdf)
- Eiffel の解説も、入力の検査を関数の中に隠す防御的な書き方に対し、検査を実行できる仕様として外に出すと説明している。[eiffel.org](https://www.eiffel.org/doc/solutions/Design_by_Contract_and_Assertions)

### 1.4 継承との関係（リスコフの置換原則）

- 再定義したルーチンは、事前条件を保つか**弱める**ことができ（require else。親の条件との論理和）、事後条件を保つか**強める**ことができる（ensure then。論理積）。[eiffel.org（Inheritance）](https://www.eiffel.org/doc/eiffel/ET-_Inheritance#Contracts_and_inheritance) [ethz.ch（Meyer）](https://se.inf.ethz.ch/~meyer/publications/computer/contract.pdf)
- 不変条件は子孫に引き継がれ、子孫が足した節とあわせた全部が成り立たなければならない。[eiffel.org（Inheritance）](https://www.eiffel.org/doc/eiffel/ET-_Inheritance#Contracts_and_inheritance)
- これはリスコフの置換原則と同じ内容で、親の型として扱われた子の実体が、親の契約を破らないための規則。[eiffel.org](https://www.eiffel.org/doc/solutions/Design_by_Contract_and_Assertions)
- tsukumo は継承を使う設計ではないので、この節の直接の適用先は薄い。インターフェースを実装する側（駆動とホストなど、実装が2つあるもの）に読み替える余地があるだけ。

## 2. TypeScript での実践

TypeScript は Eiffel の `require` / `ensure` / `invariant` を言語の機能として持たない。契約は「型で表す」「境界で実行時に検査する」「テストで確かめる」の三つに分けて実現する。以下の各機能の定義は公式の資料で確かめた。契約の言葉との対応づけは、この文書の整理である。

### 2.1 型で表せる契約

| 道具                                 | 何を契約として持つか                                                                                                     | 出典                                                                                                 |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------- |
| 判別共用体                           | 状態ごとに必須の欄が違う、という不変条件。`kind` で絞ると、その状態の欄だけが必須になる                                  | [typescriptlang.org](https://www.typescriptlang.org/docs/handbook/2/narrowing.html)                  |
| 網羅検査（`never`）                  | 「すべての場合を扱う」という事後条件に近い保証。共用体に場合を足すと、扱っていない分岐がコンパイルで落ちる               | [typescriptlang.org](https://www.typescriptlang.org/docs/handbook/2/narrowing.html)                  |
| 型述語（`x is T`）                   | 検査関数の戻り値が真なら、その変数は `T` だという約束。真偽の中身が正しいかは型が保証しない（書いた人の責任）            | [typescriptlang.org](https://www.typescriptlang.org/docs/handbook/2/narrowing.html)                  |
| `asserts` 関数                       | 「戻ってきたなら条件が成り立つ」という事前条件の検査。投げなければ、以降のスコープで型が絞られる                         | [typescriptlang.org](https://www.typescriptlang.org/docs/handbook/release-notes/typescript-3-7.html) |
| `satisfies`                          | 値の型を広げずに、定義が契約の型を満たすことだけを検査する。定数・テーブルの形の契約に向く                               | [typescriptlang.org](https://www.typescriptlang.org/docs/handbook/release-notes/typescript-4-9.html) |
| ブランド型（`string & { __brand }`） | 構造が同じ型を区別して、検査を通った値だけに型を与える。zod は「パースを通した値だけがブランド付きの型になる」と説明する | [zod.dev](https://zod.dev/api)                                                                       |

- 型述語と `asserts` はどちらも、関数の中身が型の主張と合っているかを TypeScript は確かめない。主張と実装の食い違いは検査関数の書き手の責任になる。[typescriptlang.org](https://www.typescriptlang.org/docs/handbook/2/narrowing.html)（型述語の例が、中身の判定に型の迂回を使っている点からも読める）
- 型は実行時に消えるので、型で表した契約は**コンパイルが通る範囲の内側でしか効かない**。外から来る値には実行時の検査が要る。

### 2.2 実行時の検査（境界での parse）

- zod の `parse` は不正なら投げ、`safeParse` は成否を持つ結果の値を返す。[zod.dev](https://zod.dev/api)
- 型は `z.infer` でスキーマから導ける。スキーマと型を別々に書かない。[zod.dev](https://zod.dev/api)
- `.brand<"Cat">()` を付けたスキーマの出力は、パースを通さないと作れない。[zod.dev](https://zod.dev/api)
- `.refine()` の関数は投げず、失敗を偽の値で返す。[zod.dev](https://zod.dev/api)

### 2.3 Parse, don't validate

- Alexis King の主張: 検査（validate）と解析（parse）の違いは、得た知識を捨てるか残すか。検査は真偽だけを返して知識を捨て、解析は入力を消費して、分かったことを型に刻んだ出力を返す。[lexi-lambda.github.io](https://lexi-lambda.github.io/blog/2019/11/05/parse-don-t-validate/)
- 「不正な状態を表現できないデータ構造を使う」。[lexi-lambda.github.io](https://lexi-lambda.github.io/blog/2019/11/05/parse-don-t-validate/)
- 入力は「必要な最も正確な表現に、できるだけ早く」変える。検査が内側に散ると（shotgun parsing）、一部だけ有効な入力で処理を進めてしまい、後から弾く余地がなくなる。[lexi-lambda.github.io](https://lexi-lambda.github.io/blog/2019/11/05/parse-don-t-validate/)
- 条件を型で直接表せないときは、検査を通した値だけを作る抽象型（スマートコンストラクタ）で、検査を解析のように見せる。[lexi-lambda.github.io](https://lexi-lambda.github.io/blog/2019/11/05/parse-don-t-validate/)
- 契約の言葉に直すと、解析は「顧客の側で事前条件を満たしたことを、型で運ぶ」手段で、スマートコンストラクタは「クラス不変条件を、作り方を1つに絞って守る」手段にあたる（この文書の整理）。

## 3. 副作用の隔離

- Functional Core, Imperative Shell は Gary Bernhardt の Destroy All Software の用語。純粋な関数と単純な値で判断を書く内側と、外の世界に触れる薄い外側に分ける。[destroyallsoftware.com](https://www.destroyallsoftware.com/talks/boundaries)
- 内側は入出力・時計・ネットワーク・可変な共有状態に触れず、同じ入力に同じ出力を返す。外側は外の世界から値を読み、内側を呼び、返った値を外の世界へ書く。内側は分岐が多く依存が少なく、外側は分岐が少なく依存が多い。この要約は二次的な資料だが、上の一次の講演の要旨と合っている。[waggertron.github.io](https://waggertron.github.io/tech-learning/topics/cs/functional-core-imperative-shell/)（原典の画面録画は本文を取得できず、講演ページの要旨だけ確かめた）
- 部品どうしの境界に単純な値を使うことで、単体のテストと並行処理の難しさが減る。[destroyallsoftware.com](https://www.destroyallsoftware.com/talks/boundaries)

### 3.1 契約と純粋関数の相性

次の理由は、上の資料の定義から導いたこの文書の整理で、資料が直接そう書いているわけではない。

1. 事後条件は戻り値の性質として書ける。純粋関数は戻り値が入力だけで決まるので、事後条件は「入力に対する出力の関係」になり、検査にも単体テストにも置き換えられる。
2. 副作用のある関数の契約には、外の世界の状態（ファイル・時計・ネットワーク）が入り込み、事前条件・事後条件が書き切れず、検査の再現もできなくなる。
3. 不変条件は「状態を持つ実体」に付く。状態を不変の値にして、更新を「新しい値を返す関数」にすれば、不変条件は値を作る関数（スマートコンストラクタ）の事後条件に縮む。
4. 外側の薄い層に契約の検査を集めれば（境界で parse）、内側の関数は事前条件が成り立つ前提で書ける。供給者が顧客を信用してよい、という契約の分担と同じ形になる。

## 4. 検査のコストと、どこで検査するか

- Eiffel の実行環境は、表明の種類（require・ensure・check・invariant・loop）ごとに、検査をするかしないかを独立に設定できる。ライブラリの事前条件だけを検査する設定（Supplier Precondition）もある。[eiffel.org](https://www.eiffel.org/doc/eiffelstudio/Assertion_Options)
- 公式のページは性能の数字を挙げておらず、不要な検査を切れば実行時の負担が減る、という含みだけがある。[eiffel.org](https://www.eiffel.org/doc/eiffelstudio/Assertion_Options)
- Meyer は、実行時の監視を設計・テストの間の手段として語り、本番での検査と区別している。[ethz.ch（Meyer）](https://se.inf.ethz.ch/~meyer/publications/computer/contract.pdf)
- TypeScript には「本番ではこの検査を外す」仕組みが言語に無い。検査は普通のコードなので、残すか消すかは書き手が決める（この文書の整理）。

### 4.1 判断の基準（一次情報から導いた整理）

| 区分                                                 | 扱い                                           | 根拠                                                                                        |
| ---------------------------------------------------- | ---------------------------------------------- | ------------------------------------------------------------------------------------------- |
| 外の世界から入る値（ファイル・環境変数・SDK の入力） | **境界で1回、実行時に parse する**             | 型は実行時に消える。検査を散らすと shotgun parsing になる（2.3）                            |
| 境界の内側の、型で表せる条件                         | **型に任せる**（判別共用体・ブランド型）       | 型は検査の再実行が要らず、コストが無い。契約の言葉では「事前条件を顧客側が型で満たす」      |
| 内側の関数の事前条件のうち、型で表せないもの         | **検査しない**か、**呼ぶ側のテストで確かめる** | 防御的な重複検査は Meyer が退けたもの。供給者は事前条件が成り立つと仮定してよい（1.2・1.3） |
| 内側の「ここで起きたらバグ」の確認                   | `asserts` で**少数だけ**置く                   | Eiffel の check にあたる。投げなければ以降の型が絞られる（2.1）                             |
| 純粋関数の事後条件                                   | **テストで確かめる**（実行時の検査にしない）   | 純粋なので再現でき、テストと置き換えられる（3.1）                                           |

- 過剰検査の実例（防御的プログラミング）は、内側の関数が同じ入力を何度も `undefined` や形で確かめること。上の基準では「境界で畳んだなら、内側は信頼する」で止める。
- 逆に検査が足りない実例は、境界で `as` により型だけ付けて、実行時には何も確かめていない場合。型の契約が嘘になる。

## 5. tsukumo の規約に取り入れるときの論点

リポジトリの該当文書を読んで書いた。読んだのは `.claude/rules/typescript.md`、`docs/coding-standards/typescript-writing.md`、`docs/coding-standards/error-input-and-absent-value.md`、`docs/coding-standards/layer-and-dependency.md`、`docs/coding-standards/choice-criterion.md`。

### 5.1 すでに契約の考え方を含んでいるもの

| 契約の考え方                                      | 既存の規約                                                                                                                                                                                                                                                              | 重なり方                                                                                                                                       |
| ------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| 境界で parse し、内側は信頼                       | `typescript.md`「外部由来の値は境界で検証し、変換を1箇所に封じ込める」。`typescript-writing.md`「唯一の逃げ道は境界で検証してから内側の型に変換すること」。`error-input-and-absent-value.md`「外部の入力を読む場所を1つにする」「同じ形を型と schema で二重に書かない」 | Parse, don't validate と shotgun parsing の回避をほぼそのまま含む。zod を境界に使い `z.infer` で型を導く点も同じ                               |
| スマートコンストラクタとブランド型                | `typescript-writing.md`「検査済みの branded な型で運ぶ」。作れるのは `parse…(): … \| undefined` と型述語つきの `refine` だけで、`as` では作らない。例は `CharacterPackName`・`ItemId`・`DateKey`                                                                        | 「不変条件を作り方1つで守る」を明文化している。事前条件を型で運ぶ手の実例                                                                      |
| 不正な状態を表現できなくする                      | `error-input-and-absent-value.md`「複数の「無い」が1つの状態」は判別可能な合併型にする                                                                                                                                                                                  | 不変条件を型で守る実例。「片方だけが `undefined` になる状態が実在するか」が、不変条件を問う問いにあたる                                        |
| 事前条件を呼ぶ側で満たす（`\| undefined` を畳む） | 「「無い」を層をまたいで運ばない」。「無い」は入口で畳み、内側は「必ず値がある」型で受ける。`null` は自前の型に出さず、境界で `undefined` に畳む                                                                                                                        | 内側の関数の事前条件（値がある）を、入口で満たしてから呼ぶ分担そのもの。内側に防御的な `undefined` チェックを散らさない点も Meyer の立場と一致 |
| 内側と外側の分離                                  | `layer-and-dependency.md`「`core` は `node:` / `@anthropic-ai/*` / `ws` を import しない」「`adapter` は1ファイル = 1つの境界」「`core` と `browser` は互いを import しない」。許した辺以外は dependency-cruiser が落とす                                               | Functional Core / Imperative Shell の「外の世界へ出る道が無い core」を機械で強制している。外側から値を渡す形も同じ                             |
| 外の世界の読み取りを1箇所に集約                   | `error-input-and-absent-value.md`「`process.env`・`process.cwd`・`node:os` を読めるファイルは lint が決める」。`Date` の使用を lint で落とす（`choice-criterion.md` の実例）                                                                                            | 時計・環境という副作用を端に押し出す設計。依存の注入（引数で受け取る）に当たる                                                                 |
| 不変性                                            | `typescript-writing.md`「変数は基本イミュータブル」「引数の入れ物が呼び出し先で書き変わる契約にしない」                                                                                                                                                                 | 純粋関数の前提（引数を書き換えない）。「契約」という語が既に使われている                                                                       |
| 機械で強制する                                    | `choice-criterion.md`「機械的な仕組みをヒューリスティックより優先」                                                                                                                                                                                                     | 契約も、文面より型・検査・lint で守る側に置く、という方針と整合する                                                                            |
| 失敗の分け方                                      | `error-input-and-absent-value.md`「エラーハンドリング」の2チャネル（起動時の前提不足は即時終了、動作中の一時的失敗は諦めて次へ）                                                                                                                                        | 起動時の前提は事前条件違反（バグ・設定の誤り）として即時終了、実行中の失敗は契約外の環境の失敗として落ちない、と読み替えられる                 |

結論として、「外部の入力は境界で parse する」「`| undefined` を畳む」「core と adapter の層」は、契約の**事前条件を顧客側（境界）で満たす**部分と**不変条件を型で守る**部分、そして**副作用の隔離**をすでにかなり含んでいる。

### 5.2 足りない、または名前がついていないもの

1. **事後条件の置き場。** 規約に、関数の「返したあとに成り立つこと」を書く場所や方針が無い。現状は単体テストが事実上の事後条件だが、規約からは読み取れない。純粋な `core` の関数は、戻り値の性質をテストで確かめるのが 3.1 と 4.1 の推奨。
2. **`asserts` 関数と check にあたる表明。** `src/` に `asserts` 型の関数は無い（`grep` で確かめた）。内側で「ここでこうならバグ」を表明する方法が規約に無く、`!`・`as` を禁じているので、書きたくなったとき逃げ道が無い。`typescript-writing.md` の「唯一の逃げ道」は境界の検証だけで、内側の表明は扱っていない。
3. **「型で表す・検査する・検査しない」の判断基準。** 4.1 の表に当たるものは、「境界で検証」の一文と「`\| undefined` を畳む」の個別の規則に分かれていて、一貫した基準としては書かれていない。
4. **純粋関数そのものの規約。** 層の分離（`core` は外の世界へ出る道が無い）は強制しているが、「`core` の関数は純粋にする（引数を書き換えない・時計や乱数を直接読まない）」という関数の水準の規約は、不変性の節と `Date` の禁止に分かれている。`core` に局所的な可変状態（キャッシュなど）がある場合の扱いは、`typescript-writing.md` の閉包に閉じ込める例があるだけ。
5. **不変条件の名前。** 「判別可能な合併型」「branded な型」は不変条件を守る手段だが、規約は不変条件という語で束ねていない。語を足すかは、`docs/glossary.md` の用語の方針を見てから決める。

### 5.3 衝突しうる点

1. **防御的な検査を禁じる方向と、実行時の表明を足す方向。** 契約を実行時の検査にすると、内側の関数に検査が増える。`error-input-and-absent-value.md` の「内側は『必ず値がある』型で受ける」「検査を各層に散らさない」と衝突するので、表明は境界の外では少数に絞り、「型で表せないバグ」の確認に限る必要がある。
2. **常駐プロセスは落ちない、という規約。** 契約違反を例外で落とすと、`error-input-and-absent-value.md` の「描画1回の失敗で落ちない」「即時終了は起動時の前提不足だけ」と衝突しうる。事前条件違反（バグ）を投げる場合の包む場所は、描画の境界（`ScreenBoundary` など）に任せることになる。表明の失敗を、動作中のどのチャネルに載せるかを決める必要がある。
3. **型の迂回を禁じる規則と型述語・`asserts`。** 型述語は中身を書き手が保証するもので、`typescript.md` の「型を迂回するキャストを書かない」と同じ危うさを持つ。`asserts` と型述語を許すなら、置いてよい場所（境界の検証関数、ブランド型の作り手）を絞る必要がある。既存の規約は型述語を「ブランド型の `refine`」に絞っている。
4. **契約の言葉の導入と「長くても意味が読める語」。** 利用者の方針（長くても、語から意味が分かることを優先）に沿うなら、「事前条件」「事後条件」「不変条件」は日本語として意味が通る。一方、`require`/`ensure` のような専用の関数名を足すと、`docs/glossary.md` の英語識別子との整合が要る。
5. **継承の規則は適用先が薄い。** tsukumo は継承中心の設計ではない（`adapter` は1ファイル = 1つの境界で、インターフェースは実装が2つあるものだけ）。リスコフの置換の部分は規約に入れず、駆動とホストの契約の型（`core` に置く）にだけ「事前条件を強めない・事後条件を弱めない」を書く余地がある。

### 5.4 取り入れ方の推奨（案）

案を選ぶ物差し（`choice-criterion.md`）に沿って、「仕組み」を先に、文面の条を後に置く。

1. **既存の規約を契約の語で言い直す（仕組みは増やさない）。** 「境界で parse」＝事前条件を顧客側で満たす、「`| undefined` を入口で畳む」＝内側の事前条件を満たしてから呼ぶ、「判別可能な合併型・branded な型」＝不変条件を型で守る、と対応表を `typescript-writing.md` に足す。読む人が語から意味を取りやすくなるが、機械では強制しない（ヒューリスティック。理由は、言い換えだけで検査できる対象が増えないため）。
2. **判断の基準（4.1 の表）を1か所にまとめる。** 「境界で parse／型に任せる／内側では検査しない／少数の表明／事後条件はテスト」。既存の個別の規則への見取り図にする。
3. **`core` の関数は純粋にする、を関数の水準の規約にする。** 引数を書き換えない・時計と乱数と環境を直接読まない、は一部が lint（`Date`・`process`）で強制済みなので、足りない分（引数の書き換え）が機械で見られるかを調べてから決める。
4. **内側の表明（`asserts`）は、足すなら置き場を決めてから。** 足す場合は「型で表せないバグの確認だけ」「境界の検証関数の外では少数」「失敗は動作中のチャネルへ載せる」を規則にし、`!` と `as` の代わりに使う。使い道が見つからなければ足さない（過剰な検査を避ける）。
5. **事後条件はテストの方針に書く。** 純粋な `core` の関数の戻り値の性質を確かめる単体テストを、事後条件の置き場と位置づける（`docs/coding-standards/test.md` の領分で、この文書では読んでいない）。
