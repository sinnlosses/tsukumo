# 暗いレポートの中のコード・差分の色付けと、色の予算（2026-10-18）

**この文書は調査の記録であって正典ではない。** `docs/` の他ファイルにある「節の索引」はここには作らない。
色の役割の正典は `docs/architecture/screen-design.md`（13.1 原則5・13.2 のコードの段）、値の正典は `src/browser/styles/theme.css`
で、**採用が決まるまでコードは1行も変わらない**。

**主題**: レポートのコードの塊・差分・インラインコードの色付けをどう設計するか、レポート1枚の中で色相をいくつまで、何に使ってよいか。
`docs/history/research/dark-ui-color-and-status-semantics.md`（APCA・状態色の明るさ・系列色・Mermaid）と
`docs/research/report-block-craft.md`（行の印・畳み・枠の構造）の中身は重ねず、そこから引くだけにする。

**出典の印**: 無印は一次情報（原著・公式の配布物）。**【実測】**は配布ファイル・公開 CSS を 2026-10-18 に読んだ値と、
手元の `capture-view` の画（/tmp/code-now-crop.png・/tmp/diff-now-crop.png）から拾った画素。**【二次】**は記事や他の論文の要約から取ったもの。
**【換算】**は私の計算で、WCAG 2 の比・APCA Lc（0.0.98G-4g）・OKLCH（Ottosson）・OKLab の距離 ΔE・色覚の模擬（Machado 2009、重症度 1.0）を使った。

## 要点（10行以内）

1. 構文色の効果は**小さく、条件つき**。有意差は 10 名規模の研究だけで（Sarkar：中央値で 8.4 秒速い）、390 名の Hannebauer と 34 名の Beelders は差を出していない。効くのは**色の区別が問いの構造と一致したとき**だけ（Asenov：強めた構造の問いは 21〜75% 速く、それ以外は差なし）[1]〜[6]
2. 控えめな系は数で分かれる。Alabaster は有彩 4 色相、Vesper は 2、zenwritten は 0。どれも **keyword に色相を使わない**（地の字・灰に落とす・太字）。Alabaster・JetBrains・lackluster は**定義と呼び出しを分ける**。tsukumo が配る `github-dark` は有彩 6 値・5 色相で、keyword に赤を当てている【実測】[11][12][18][19][21]
3. いまの tsukumo のコードの塊は、`ground` の枠の中に `github-dark` の #0d1117（青みの黒）の箱がもう1段入る。`dark-ui-color-and-status-semantics.md` 5 節の「`ground` に置き換わる」は実画では成り立っていない【実測】
4. `github-dark` の構文色は意味を固定した色と重なる。OKLab ΔE は tag↔ok が 0.019、entity↔ask が 0.033、constant↔info が 0.044【換算】。report-blocks の1画面に色相の族が 7 つ出て、うち 3 つはコードの塊にしか出ていない【実測】
5. 差分は字の幅だけに濃い地が付く（#67060c・#033a16）。語の地の上の字は 3.6:1 で、2 型色覚では追加と削除の差が ΔE 0.018 まで縮む【換算】。GitHub は**行を全幅に薄く（15%・10%）、語を 40%** にし、色覚対応のモードでは青と橙に替える【実測】[14]
6. 探索の研究は「**5 色までは並列、7 色が上限**」（Healey 1996）。Apple HIG は「同じ色に別の意味を持たせない」、GOV.UK は「機能の色はその文脈でだけ使う」[25][29][30]
7. 示唆: **色相は意味に、明度・太さ・地の段は構造に**。コードの色相は彩度 C ≤ 0.06 の淡い 2 色（文字列・定数）にとどめる。keyword は地の字のまま、名前は太さで拾わせる。差分は全幅の帯にして、追加をわずかに明るくする。これで状態色と accent の 6 色相の予算に収まる

## 0. いまの画【実測】

| 項目             | いまの値                                                                                                                                                                                                                                                   | 測り方                                                                              |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| コードの地       | `pre` は `ground` #191720（0.5rem の余白・角丸 0.4rem）。その中の `code.hljs` が **#0d1117**（`github-dark` の `.hljs` の地と 1em の余白が残る）。#0d1117 は OKLCH H 258 の青寄りで、紫寄りの `ground`（H 295）と色みが食い違う。`ground` との比は 1.07:1  | 画素（/tmp/code-now-tall.png）と `node_modules/highlight.js/styles/github-dark.css` |
| 構文色           | 地の字 #c9d1d9 と、keyword #ff7b72・名前 #d2a8ff・定数 #79c0ff・文字列 #a5d6ff・組み込み #ffa657・タグ #7ee787・コメント #8b949e。**8 値・有彩 5 色相**（定数と文字列はどちらも青）。hljs は関数の**定義と呼び出しに同じ `title.function_`** を付ける      | `github-dark.css`・`lib/languages/javascript.js` の FUNCTION_CALL [21]              |
| 状態色との距離   | tag↔ok 0.019・entity↔ask 0.033・constant↔info 0.044・keyword↔ng 0.084（OKLab ΔE。0.02 前後は同じ色に見える）。comment は `ground` 上で Lc −43                                                                                                              | 【換算】                                                                            |
| 1画面の色相      | report-blocks（1440×2400）の報告欄で彩度 C ≥ 0.06 の画素の色相は 7 つの族（30°・60°・90°・150°・180°・240°・300°）に分かれる。コードの塊には 30°・60°・240°・300° が出て、**60°・240°・300° はコードの塊にしか出ていない**（30° は `state-ng` の札と共有） | 画素の色相の度数【実測】                                                            |
| 差分             | 色付けは字の幅の `<span>` だけで、行末がぎざぎざになる。削除は地 #67060c に字 #ffdcd7、追加は地 #033a16 に字 #aff5b4 で、**構文色は消える**。語の地（状態色 45%）は #a64b4f と #3a8546、その上の字は 4.4:1 と 3.6:1。2 型の模擬で行 ΔE 0.042・語 0.018     | /tmp/diff-now-crop.png の画素、`report-notation.module.css` の `.code-diff-*`       |
| 印の行           | #0d1117 の上に `surface-raised` を重ねて #23262c。左に 2px の `accent`                                                                                                                                                                                     | 画素                                                                                |
| インラインコード | 地 `surface-raised`（`surface` 上で #36333e・1.31:1）。字は `ink` で大きさは本文と同じ 15px。左右 0.25rem・角丸 0.25rem。`kbd`・`samp` も同じ見た目                                                                                                        | `report-notation.module.css` 1810〜1822 行                                          |

## 1. 知見: 構文色の効果の研究

| 研究                               | 被験者・課題                                       | 色の条件                                              | 速さ                                                                                       | 正しさ・視線・主観                                                                                           | 出典 |
| ---------------------------------- | -------------------------------------------------- | ----------------------------------------------------- | ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------ | ---- |
| Gilmore & Green 1988               | 誤りの発見（表層の誤り・計画の誤り）               | 制御構造の印／計画の構造の色（構文ではない）          | 表層の誤りは制御構造の印で、深い誤りは計画の色で速くなる                                   | 「足した情報は課題に関係するときだけ効く」【二次】                                                           | [1]  |
| Hakala ほか 2006                   | 中級者・Java の局所パターンの探索                  | 3 種の色付け                                          | 色付けの間で差なし。白地に黒字と同じ                                                       | 【二次】                                                                                                     | [2]  |
| Sarkar 2015（PPIG）                | 10 名・被験者内・Python の読解 3 対                | Solarized                                             | **中央値で 8.4 秒速い**（WSRT T=136, p=0.047）                                             | 注視の数・長さは差なし。**領域の行き来が中央値で 23 回減る**（p=0.045）。経験と時間の得は負の相関（ρ=−0.37） | [1]  |
| Dimitri 2015（PPIG）               | 10 名・Sonic Pi で書く・直す                       | Sonic Pi の既定                                       | 書く・直すの両方で有意に速い（効果量の記載なし）                                           | 得は経験が増すと減る                                                                                         | [2]  |
| Beelders & du Plessis 2016（JEMR） | 34 名（被験者間 17 対 17）・C# の出力を答える 2 題 | 色 対 白黒                                            | —                                                                                          | 注視の数・長さ・戻りは**有意差なし**（U 検定 p=0.12〜0.95）。主観では色ありが読みやすく美しい                | [3]  |
| Asenov ほか 2016（CHI）            | 33 名・Java・被験者内・15 問                       | Eclipse の構文色 対 地の帯・枠・アイコンを足した 2 段 | **強めた構造を問う問いだけ 21〜63%・29〜75% 速い**。強めていない構造の問いは差なし【二次】 | 誤りは天井効果で判定できない。最も豊かな段は「時に圧倒される」と嫌われたが、成績は最良                       | [4]  |
| Hannebauer ほか 2018（ESE）        | 390 名の学部生・Java の小課題                      | Eclipse の既定                                        | —                                                                                          | **理解を助ける証拠なし**。抄録は「構文色は IDE から人への伝達路を浪費している」                              | [5]  |
| Park ほか 2023（ICER）             | 初学者・12 題・交差・視線                          | 素の Java／範囲の地を塗った Java／Stride              | 正しさ・速さとも差なし                                                                     | 「提示の大きな変更でも成績への効果は小さい」                                                                 | [6]  |
| Su ほか 2026（arXiv）              | 53 名・視線                                        | 色ではなく出し方（一括・1 字ずつ・構文の塊ごと）      | —                                                                                          | 塊ごとに出すと意味の単位に注意が向く                                                                         | [7]  |

- 有意差が出たのは 10 名規模の研究（Sarkar・Dimitri）だけで、標本の大きい研究と被験者間の視線研究は差を出していない [1][2][3][5]
- 効くのは**色の区別が問いの構造と一致したとき**（Gilmore & Green・Asenov）。レポートの読み手の問いは「何が変わったか」「どの名前か」で、keyword・文字列の区別とは一致しない [1][4]
- **経験が増すと得が減る**（Sarkar・Dimitri）。読み手は作者 1 人で、コードを読み慣れている [1][2]
- **好みは成績より強く出る**（Beelders・Asenov）。「楽しく仕事をする」ための画面では、好みも無視できない [3][4]
- **色の数そのものを変えた統制実験は見つからなかった。** 数の根拠は視覚探索の研究（5 節）から借りる。依頼文の「Dimitri 2015＝色の数の効果」は取り違えで、Sonic Pi で色の有無を比べた研究だった [2]

## 2. 知見: 控えめな色付けの潮流と、各テーマの割り当て【実測】

「字の色」は既定の字を含む異なる値の数、括弧の中は有彩の色相の数 [11]〜[21]。

| テーマ                          | 地 / 既定の字     | 字の色（有彩） | keyword                   | 定義 / 呼び出し                | 文字列         | 数・定数         | コメント                      | 句読点・演算子 | 太字・斜体         |
| ------------------------------- | ----------------- | -------------- | ------------------------- | ------------------------------ | -------------- | ---------------- | ----------------------------- | -------------- | ------------------ |
| Alabaster Dark                  | #0E1415 / #CECECE | 6（4）         | 地の字                    | 定義だけ #71ADE7、呼び出しは地 | #95CB82        | #CC8BC9          | **#DFDF8E（黄で目立たせる）** | #708B8D        | なし               |
| Alabaster Dark Mono             | #111 / #999       | 2（0）         | 地                        | 定義 #EEE＋地の帯 #333         | #EEE           | #EEE             | 地の帯 #333                   | 地             | なし               |
| Vesper                          | #101010 / #FFF    | 5（2）         | **#A0A0A0（暗くする）**   | #FFC799（両方）                | #99FFE4        | #FFC799          | #8b8b8b94                     | 演算子 #A0A0A0 | なし               |
| zenwritten                      | #191919 / #BBBBBB | 7（0）         | 地＋**太字**              | 地                             | #8B8B8B 斜体   | #8B8B8B          | #686868 斜体                  | #7C7C7C        | 太字・斜体で分ける |
| lackluster                      | #101010 / #cccccc | 9（2）         | #666666（暗くする）       | 定義 #deeeed・呼び出し #7a7a7a | #708090        | #aaaaaa          | #3A3A3A                       | #7a7a7a        | なし               |
| JetBrains Dark（New UI）        | #1e1f22 / #bcbec4 | 9（7）         | #cf8e6d                   | **宣言 #56a8f5、呼び出しは地** | #6aab73        | #2aacb8          | #7a7e85                       | 地             | 斜体: 定数・static |
| GitHub dark（Primer）           | #0d1117 / #f0f6fc | 8（5）         | #ff7b72                   | #d2a8ff（両方）                | #a5d6ff        | #79c0ff          | #9198a1                       | —              | なし               |
| Rosé Pine                       | #191724 / #e0def4 | 9（6）         | pine #31748f              | 定義 rose・組み込み love       | gold #f6c177   | rose / pine      | muted #6e6a86 斜体            | subtle #908caa | 斜体               |
| Nord                            | #2e3440 / #d8dee9 | 10（6）        | nord9 #81a1c1             | nord8 #88c0d0                  | nord14 #a3be8c | nord15 #b48ead   | #616E88                       | nord9 / nord6  | ほぼなし           |
| Zed 既定（One Dark）            | #282c33 / #acb2be | 約 13（7）     | #b477cf                   | #73ade9                        | #a1c181        | #bf956a          | #5d636f                       | #6eb4bf        | なし               |
| Catppuccin Mocha                | #1e1e2e / #cdd6f4 | 13（11）       | mauve                     | blue                           | green          | peach            | overlay2                      | sky / overlay2 | 指定なし           |
| VS Code Dark 2026（いまの既定） | #121314 / #BBBEBF | 13（9）        | #FF7B72（制御は #C586C0） | #D2A8FF                        | #A5D6FF        | #B5CEA8・#79C0FF | #8B949E                       | #D4D4D4        | なし               |

- **控えめな系は数と役割で分かれる。** keyword は地の字のまま（Alabaster）か暗くする（Vesper・lackluster）か、太字にする（zenwritten）。名前は**定義だけ**を拾う（Alabaster・JetBrains・lackluster）[11][18][19]
- **Alabaster の論**（作者 Prokopov、2025-10-15）: 「全部を目立たせると何も目立たない」。覚えきれる数の色だけを使う。変数と関数呼び出しはコードの約 75% を占めるので色を付けない。句読点は暗く、コメントは隠さずに黄で目立たせる。赤はエラーのために取っておく。**明度を揃えたパレットは見分けにくい**（目は色相より明度の差に敏感）[11]
- **Rougier の 6 つの面**（N Λ N の配色の原理）: critical（地を強い赤で塗る。稀に）、popout（色相を変えて飛び出させる）、strong（**同じ色で太さだけ 1 段上げる**。見出し・keyword）、salient（同じ明るさで色相だけ変える。リンク）、faded（同じ色相で弱める。コメント）、subtle（ごく薄い地で範囲を示す）。「内容でなく知覚で色を決める。必要なのは限られた色と、何を salient・faded・strong にするかの選択」[8]
- **zenbones**: 「コードは明暗の差と書体の変化で強調し、色は診断・差分・検索結果など別の役割に回す」[19]
- **色に役割を固定する系**: Rosé Pine は色ごとに構文と差分の役を結ぶ（Love＝エラーと削除、Pine＝keyword と追加）。Nord は nord14 を文字列と差分の追加に当てる。ただ、どちらもエディタ版でずれている（Rosé Pine の VS Code 版は追加が foam、Nord の VS Code 版は追加が青）[16][17]
- **GitHub の変種**: dimmed は同じ色相のまま彩度を落とし、high_contrast は明るくする。**colorblind で変わるのは緑系と赤系だけ**（keyword が #f0883e の橙、tag が #a5d6ff）。コメントはどの変種でも #9198a1 [14]
- **意味の色付け（semantic tokens）**: LSP の型は 23 種・修飾は 10 種で、VS Code は「構文色に足すもの」と位置付け、既定は `configuredByTheme`。Wayne は「色は大きな情報の伝達路なのに構文の区別だけに使っている」と書き、入れ子の深さ・import の出どころ・引数を色で示す案を挙げる。レポートは静的で言語サーバが無いので、**定義と呼び出しの区別すら hljs では取れない**（どちらも `title.function_`）[9][10][21]

## 3. 知見: ドキュメント製品のコードの塊（ダーク）【実測】

headless Chromium（1440×1000・`colorScheme: 'dark'`）で計算済みのスタイルを測った。「浮」は本文の地より明るく、「沈」は暗い。
比は塊の地と本文の地の WCAG 比、構文色は 1 つの塊で数えた下限 [34]〜[44]。

| サイト                    | 塊の地（対本文）                            | 枠・角丸               | 字の大きさ（本文比）・行高 | 札・コピー                                 | 長い行       | 構文色                              |
| ------------------------- | ------------------------------------------- | ---------------------- | -------------------------- | ------------------------------------------ | ------------ | ----------------------------------- |
| GitHub README             | #151b23 浮 1.09                             | 枠なし・6px            | 0.85・1.45                 | 札なし・コピーは常時                       | 横スクロール | 5 色                                |
| Stripe API                | 応答 #1b1e25 浮 1.08 / 要求 #3e444f 浮 1.83 | 1px #2b3039・8px       | 1.0・1.3                   | 上の帯に言語の選択とコピー。要求だけ行番号 | 横スクロール | 5 色                                |
| Linear（developers）      | #1c1c1f 浮 1.17                             | 1px 白 5%・8px         | 0.93・1.5                  | 右上にコピー（常時）                       | 横スクロール | 4 色（GitHub Dark Dimmed と同じ値） |
| Next.js / Vercel（Geist） | #0a0a0a 浮 1.06                             | 1px #2e2e2e・8px       | 0.81・1.54                 | 上の帯にファイル名・言語・コピー（常時）   | 横スクロール | 4〜5 色                             |
| Tailwind                  | 白 5% を 2 重（#1c1f29）浮 1.22             | inset 1px 白 10%・12px | 0.875・1.43                | 外枠の上段にファイル名、右上にコピー       | 横スクロール | 7 色（Shiki の独自テーマ）          |
| MDN                       | #2d3034 浮 1.33                             | 1px #51565d・4px       | 1.0・1.75                  | 見出しの帯に言語名「JS」と文字の「Copy」   | **折り返す** | 5 色                                |
| React                     | #16181d **沈** 1.19                         | 枠なし・16px           | 0.8・1.76                  | 静的な塊は札もコピーもなし                 | 横スクロール | 4 色                                |
| Astro（Expressive Code）  | #23262f 浮 1.17                             | 1px・角ほぼ 0          | 0.875・1.75                | ファイル名はタブの形、コピーは hover だけ  | 横スクロール | 5 色（Night Owl）                   |
| Rust doc                  | #2a2a2a **沈** 1.17                         | 枠なし・6px            | 1.0・1.5                   | hover でコピー                             | 横スクロール | 6 色                                |

- **地は本文から 1.06〜1.22 だけ浮かせる**のが大半で、差が小さいぶん 1px の枠か inset の輪郭を添える。沈めるのは React と rustdoc。
  tsukumo の `ground`（`surface` から 1.10 沈む）はこの帯の中で、向きは正典どおり「沈む」でよい
- **1 つの塊の構文色は 4〜7 色**。控えめなテーマを既定にした製品は無いが、Linear は Dimmed（彩度を落とした変種）を選んでいる
- 字は本文の 0.8〜0.875 倍が中心で、tsukumo の 1.0（15px）は MDN・Stripe・rustdoc と同じ少数派。行高は 1.43〜1.76
- 強調行は「**淡い地＋左 2px の縦罫**」が定番（Tailwind #72d7ff 15%＋2px #00bcff、Geist #0f2f57＋inset 2px、Expressive Code は色相 284 の LCH 32% を 50%）。
  tsukumo の印の行（`surface-raised`＋2px の `accent`）は同じ形。Shiki の変換は class（`.highlighted`・`.diff.add`・`.focused`・`.highlighted-word`）を付けるだけで、色を持たない [42][43]
- 差分の行の作法: Expressive Code は ins・del の地を LCH の明度 32%・彩度 40 で揃えて 50% に重ね、縦罫と記号を足す。fumadocs（Next.js のページ）は**削除の行を不透明度 0.7 に落とす** [37][42]

## 4. 知見: 差分の色【実測】

| 製品                      | 追加の行 / 語                   | 削除の行 / 語                 | 字                                                        | 色覚対応                                                               |
| ------------------------- | ------------------------------- | ----------------------------- | --------------------------------------------------------- | ---------------------------------------------------------------------- |
| GitHub dark               | #2ea043 の 15% / 40%            | #f85149 の 10% / 40%          | 変えない（構文色を保つ）                                  | colorblind: 追加は青 #388bfd、削除は橙 #db6d28。tritanopia: 追加だけ青 |
| GitHub dark_high_contrast | #0ac740 の 20% / #006222        | #ff8080 の 20% / #ad0116      | 変えない                                                  | —                                                                      |
| delta 0.20.1              | #002800 / #006000               | #3f0001 / #901011             | **削除の行だけ構文色を消す**（minus-style "normal auto"） | 組み込みは無い（設定で変える）                                         |
| difftastic 0.72.0         | 地なし                          | 地なし                        | 変わった字を bright green / red にし、**太字＋下線**      | 無い                                                                   |
| GitLab（Dark）            | #233726 / rgba(51,255,51,.2)    | #4b2526 / rgba(255,51,51,.25) | 変えない                                                  | 利用者が追加・削除の色を自分で選ぶ                                     |
| VS Code（既定）           | rgba(155,185,85,.2) / #9ccc2c33 | #ff000033 / #ff000033         | 変えない                                                  | 無い                                                                   |
| JetBrains Dark            | #294436                         | **#484a4a（灰）**             | 変えない                                                  | 2 型・1 型用の値を持つ                                                 |

GitHub の値を #0d1117 に重ねると【換算】、追加の行は L 0.249、削除の行は L 0.225 で、**追加のほうが明るい**。語の地はどちらも
L 0.37〜0.38。2 型の模擬では行が ΔE 0.022、語が 0.020 まで縮み、colorblind の青と橙では 0.067 と 0.153 に戻る。
**赤と緑の明るさを揃えるほど、2 型では同じ色になる**（L 0.29・C 0.035 で揃えた赤と緑は 2 型で ΔE 0.004【換算】）。

- 地は 2 段（行の地と語の地）が主流。GitHub は行の地が塊の地と 1.1〜1.2:1、語の地が行の地と 1.56〜1.65:1【換算】
- 字の色は変えず、構文色を差分の中でも保つのが主流（GitHub・GitLab・VS Code・JetBrains）。delta は削除の行だけ構文色を消し、「読むのは新しいほう」を明度で示す
- 地を塗らない流儀もある。difftastic は**字の太さと下線**で変わった語を示し、色に頼る量を減らしている [23]

## 5. 知見: レポートの中の色の予算

| 出典                                               | 言っていること                                                                                                                                                                                     |
| -------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Green & Anderson 1956（Smallman & Boynton の要約） | 目標の色を知っているとき、探索時間は**目標と同じ色の記号の数**にほぼ比例する。色が意味を持つのは、その色の数が少ないときだけ [26]                                                                  |
| Christ 1975（Human Factors）                       | 1952〜1973 年の 42 研究のメタ分析。色の符号は条件によって**大きく効くこともあれば、害になることもある** [27]                                                                                       |
| Healey 1996（IEEE Vis）                            | 38 名の目標探索。**3 色・5 色では並列探索**（3 色で 459〜549 ms、5 色で 508〜661 ms、誤りは約 2.5%）、7 色は選び方次第、9 色では一部が逐次探索に落ちる。「同時に出せるのは等輝度で 7 色まで」 [25] |
| Smallman & Boynton 1990（JOSA A）                  | 基本色名に沿って選べば、9 色の群まで探索時間はわずかしか伸びない。それまでの研究の上限は 6 色 [26]                                                                                                 |
| Ware（Information Visualization）                  | 名義の符号には 5〜10 色相。最初の 6 色は白・黒・赤・黄・緑・青【二次】 [28]                                                                                                                        |
| Imhof・Tufte                                       | 強い色は小さな面積に、くすんだ地の上で使う。大きな面に並べない【二次】 [33]                                                                                                                        |
| Apple HIG「Color」                                 | 「**同じ色に別の意味を持たせない**。状態や操作を伝えるときは特に一貫させる」「色だけで区別しない。文字や形を添える」 [29]                                                                          |
| GOV.UK Design System                               | 機能の色（error・success・focus など）は「**設計された文脈でだけ使う**」。focus の色は focus にしか使わない [30]                                                                                   |
| Material 3                                         | 色は役割（primary・secondary・tertiary・error・surface…）で当てる。動的な色の中で意味の色（error など）を保つため、色相を主色へ**最大 15° だけ**寄せる（`Blend.harmonize`） [31]                   |
| USWDS                                              | 状態色は info・error・warning・success・emergency・disabled の 6 族に固定 [32]                                                                                                                     |

- 意味の色を「その意味にだけ使う」規則は、どの体系にもある（Apple・GOV.UK・Material・USWDS）。tsukumo の原則5も同じ形をしている [29]〜[32]
- **数の根拠は「5 色までは並列、7 が上限」**（Healey）。tsukumo の意味を固定した色相は state 5（ok・warn・ng・info・ask）＋ accent 1 の **6** で、すでに上限の近くにある。ほかの層（コード・系列色）が同じ色相を使えば、意味の色の探索が逐次に落ちる [25][26]
- Material の harmonize は「パックの色が変わっても意味の色は 15° までしか動かさない」という、tsukumo の「accent だけが動き、状態色は固定」の判断と同じ向きの先例 [31]

## 6. 知見: インラインコードと「機械の名前」【実測】

| サイト           | 地                                             | 字                                         | 大きさ       | 左右の余白・角丸      | 枠          |
| ---------------- | ---------------------------------------------- | ------------------------------------------ | ------------ | --------------------- | ----------- |
| GitHub           | #656c76 の 20%（合成 #1f232a）                 | 本文と同じ                                 | 85%          | .2em .4em・6px        | なし        |
| Stripe API       | #1b1e25                                        | 本文と同じ・太さ 500                       | 0.85em       | 2px 4px・6px          | 1px #2b3039 |
| Linear           | #1c1c1f                                        | 本文と同じ                                 | 0.875em      | 約 .09em .22em・4px   | 1px #34343a |
| Next.js / Vercel | #1a1a1a                                        | #ededed / #fff                             | 0.81 / 0.9em | 3px / 1px 5px・4〜5px | 1px 白 14%  |
| Tailwind         | 地なし                                         | 本文より明るい #fff・太さ 500。前後に「`」 | 1em          | 0                     | なし        |
| MDN              | #2d3034                                        | 本文と同じ                                 | 1em          | 2px 4px・4px          | なし        |
| React            | #9d9db1 の 10%                                 | 本文よりわずかに暗い                       | 0.9em        | 1px 4px・6px          | なし        |
| Notion           | rgba(135,131,120,.15)                          | **赤 #eb5757**【二次】                     | 85%          | .2em .4em・3px        | なし        |
| tsukumo（いま）  | `ink` の 10%（`surface` 上で #36333e・1.31:1） | 本文と同じ `ink`                           | 1em（15px）  | 0 .25rem・.25rem      | なし        |

- 主流は「**一段明るい地＋本文と同じ字＋0.81〜0.9em＋角 4〜6px**」。字の色を変えるのは Tailwind（地なし・太字・バッククォート）と Notion（赤）だけ [34]〜[45]
- 折り返しは `overflow-wrap: break-word` が多い。tsukumo の `anywhere` はどこでも切れるので、パスが字の途中で割れる。
  Chicago Manual of Style 14.18 は URL を「`//` と `:` の後、`/`・`.`・`-`・`_`・`?`・`#`・`%` の前」で割り、ハイフンを足さない【二次】[46]
- **kbd はキーの形にする**: GitHub は地 #151b23、1px #3d444d（70%）の枠、下に inset 1px の影、11px。MDN は 1px #51565d の枠で、下だけ 2px。
  tsukumo は `kbd`・`samp` を `code` と同じ見た目にしていて、キーと名前とコマンドの出力が見分けられない [34][40]

## 7. tsukumo に効く示唆

### 7.1 いま／先例／差

| 項目               | いま                                                 | 先例                                                                 | 差                                            |
| ------------------ | ---------------------------------------------------- | -------------------------------------------------------------------- | --------------------------------------------- |
| コードの箱         | `ground` の中に #0d1117 の箱（2 段・色みが食い違う） | 1 段の地（GitHub・Alabaster ほか）                                   | 箱が 1 段多い                                 |
| 構文の色相         | 5（keyword に赤）                                    | 控えめな系は 0〜4。keyword は地の字か、暗くするか、太字              | 1〜5 多い                                     |
| 意味の色との重なり | ΔE 0.019〜0.044 が 3 組                              | Apple・GOV.UK は別の意味に同じ色を使わない                           | 規則に反している                              |
| 差分の帯           | 字の幅だけ。構文色が消える                           | 行の全幅、構文色を保つ                                               | 帯と構文色                                    |
| 差分の明るさ       | 削除 L 0.328 > 追加 L 0.305                          | GitHub は追加が明るい（0.249 > 0.225）                               | 向きが逆                                      |
| 差分の語の上の字   | 3.6:1・4.4:1                                         | GitHub 9.4:1（字 #f0f6fc）、delta の地に `ink` で 6.2〜7.3:1【換算】 | 足りない                                      |
| 印の行             | `surface-raised`＋左 2px の `accent`                 | 淡い地＋左 2px（Tailwind・Geist・Expressive Code）                   | 同じ形（#0d1117 の箱だけが余計）              |
| インラインコード   | `ink` 10% の地・本文と同じ字・1em・角 .25rem         | 一段明るい地・本文と同じ字・0.81〜0.9em・角 4〜6px                   | 大きさだけ違う（下の 7.5 で据え置きを勧める） |
| kbd・samp          | `code` と同じ見た目                                  | kbd は枠と下の影でキーの形（GitHub・MDN）                            | キーが名前と見分けられない                    |
| 長いパス           | `overflow-wrap: anywhere`（字の途中で割れる）        | `break-word`、印刷の作法は `/` の前で割る                            | 割れる場所                                    |

### 7.2 規則の形: 色相は意味に、明度・太さ・地の段は構造に

- **意味の色相は 6 つで打ち止め**: `state-ok`・`state-warn`・`state-ng`・`state-info`・`state-ask`・`accent`（`state-memo` は `ink`）。文字のラベルと対でだけ使う（原則5のまま）
- **構造は色相を使わずに描く**: 字の 4 段（`ink-bright`・`ink`・`ink-soft`・`ink-quiet`）、太さ 600、地の 3 段（`ground`・`surface`・`surface-raised`）。Rougier の strong・faded・subtle と同じ
- **コードの色は「淡い色」の層**に分ける: 彩度 C ≤ 0.06（状態色の C 0.076〜0.160 の半分以下）で、2 色相まで。信号の層（状態色）と見た目の強さで分かれる
- 系列色（`chart-series-*`）はグラフの塊の中だけで、直接のラベルと対にする（いまのまま）

### 7.3 (a) コードの塊の候補

1. **箱を 1 段にする**: `.detail-block pre code.hljs { background: transparent; padding: 0 }`。地は正典の「沈む＝コードブロック」の `ground` だけになる。描画の差は内側の箱が消えることだけ
2. **構文色を 5 値・2 色相にする**（候補。値は【換算】、`ground` #191720 の上）:

| 役                                | hljs の class                                  | 値                                   | OKLCH           | WCAG / Lc     | 意味の色との最小 ΔE            |
| --------------------------------- | ---------------------------------------------- | ------------------------------------ | --------------- | ------------- | ------------------------------ |
| 既定（識別子・keyword・型・属性） | `.hljs`・`keyword`・`type`・`built_in`・`attr` | `ink` #e8e3ea                        | 0.922 0.011 316 | 14.0:1 / −90  | —                              |
| 関数・クラスの名前                | `title.function_`・`title.class_`              | `ink-bright` #f7f6f8 ＋ **太さ 600** | 0.974 0.003 308 | 16.5:1 / −101 | —                              |
| 文字列・正規表現                  | `string`・`regexp`                             | #c9c79e                              | 0.821 0.055 105 | 10.3:1 / −70  | 0.069（warn）                  |
| 数・定数・真偽                    | `number`・`literal`・`variable.constant`       | #deb7cf                              | 0.821 0.055 341 | 9.9:1 / −69   | 0.065（accent の既定 #f2b0a0） |
| コメント・句読点・演算子          | `comment`・`punctuation`・`operator`           | `ink-soft` #aeaab1                   | 0.743 0.011 311 | 7.8:1 / −56   | —                              |

- 2 色相は意味の 6 色と accent の既定 2 種（#6fe3cd・#f2b0a0）から最も離れる組を、L 0.82・C 0.055 で総当たりして選んだ。2 色どうしは 2 型で ΔE 0.068、1 型で 0.084 離れる（3 型では 0.038 に縮む）【換算】
- `github-dark` の 5 色相がこの 2 色相に替わり、1 画面の色相の族はコードの分だけ減る。IBM Plex Mono の 600 は同梱済みなので、太さには追加の配布物が要らない
- **定義だけを太くするには hljs では足りない。** 呼び出しも同じ class なので、両方を太くするか、rehype の段で「直前が `function`・`class`・`const … =` の名前」だけに印を付ける必要がある。Shiki と tree-sitter に替える案は `docs/research/architecture-rethink.md` の比較に譲る
- コメントは Alabaster のように目立たせる手もある。ただ、レポートには行の印のラベルと本文があるので、コメントは faded（`ink-soft`）に寄せた。Lc −56 は本文でない字の目安 60 をわずかに割る。`ink` の 76%（#b6b2ba・Lc −60）なら届くが、字の段が 1 つ増える
- 好み（Beelders・Asenov の主観）を考えると、作者が色の多い画を好むなら `github-dark` に戻せる切り替えを残す価値がある。ただし、これはつまみを増やす判断になる

### 7.4 (b) 差分の候補

| 段       | いま                  | 候補【換算】        | OKLCH           | `ink` の比 |
| -------- | --------------------- | ------------------- | --------------- | ---------- |
| 追加の行 | #033a16（字の幅だけ） | **#203524（全幅）** | 0.306 0.041 149 | 10.4:1     |
| 削除の行 | #67060c（字の幅だけ） | **#372120（全幅）** | 0.276 0.034 22  | 11.9:1     |
| 追加の語 | #3a8546               | **#345d3e**         | 0.439 0.069 151 | 6.0:1      |
| 削除の語 | #a64b4f               | **#603334**         | 0.379 0.065 19  | 8.2:1      |

- **追加を明るく、削除を暗く**して（GitHub と同じ向き）、2 型でも明度で分かれるようにする。2 型での ΔE は、行は薄くしたぶん 0.042 → 0.028 と縮むが、語は 0.018 → 0.059 に広がる。どちらも L を揃えた場合の 0.004 よりはるかに大きい。語の地は行の地と 1.44〜1.74:1 で浮く（GitHub と同じ帯）
- **`color-mix(in srgb, var(--ground), var(--state-ok) 12%)` では作らない。** `ground` の紫に引かれて色相が 175° になり、accent #6fe3cd の 179° と重なる。`in oklab` でも 197° になる。`report-change-*` と同じく、固定の値として `theme.css` に持つ【換算】
- 字は構文色（7.3 の 5 値）のまま。行頭の `+`・`−` を状態色で溝に置き、これを文字のラベル（原則5）にする。左の 2px の罫は `.code-line-mark` の `accent` とぶつかるので足さない
- 色覚に合わせた青と橙（GitHub colorblind 型）は、同じ L・C で 3 型とも ΔE 0.062〜0.076 を保つ。ただ、青は `state-info` の意味と重なる。tsukumo の利用者は作者 1 人なので、要るときの設定に回す
- delta の「削除の行は構文色を消す」を取ると、読むのは新しいほうだと明度で示せる。ただ、削除した理由を読む場面では字が弱すぎる。取るのは見本で確かめてから

### 7.5 (c) インラインコード・kbd・パスの候補

- **インラインコードは色を足さず、いまの形を保つ**。地（`surface-raised`・1.31:1）・本文と同じ字・角 .25rem（4px）は主流の帯に入っている。
  大きさは主流の 0.85em に下げない。同梱の IBM Plex Mono は x-height が 0.516（OS/2 の sxHeight 516/1000【実測】）で、
  本文の欧文は `font-size-adjust: ex-height 0.545` で揃えてある。1em でもコードの x-height は本文の 0.95 倍になり、0.875em だと 0.83 倍まで縮む【換算】
- **kbd をキーの形にする**: 地は `surface-raised` のまま、1px の `rule` の枠と、下だけ 2px（MDN の形）。字は `ink`。色相は足さない。
  `samp`（機械の出力）は地を敷かず `ink-soft` の等幅にすると、名前（浮く）・キー（枠）・出力（弱い字）の 3 つが色相なしで分かれる
- **パスは `/` の前で割る**: rehype の段でパスらしいインラインコードの `/`・`.`・`-`・`_` の前に `<wbr>` を入れ、`overflow-wrap: anywhere` は最後の受け皿に残す（CMOS 14.18 の作法）。
  `report-file-link`（押せるパス）も同じ割り方にする
- Notion のような赤い字は、`state-ng` と同じ色相になるので採らない（7.2 の規則）

### 7.6 段階

1. 箱を 1 段にする（7.3-1）。描画の差は小さく、正典の「沈む」の段に揃うだけ
2. 差分を全幅の帯と固定の 4 値にする（7.4）。`report-change-added` / `removed` と同じ意味の色の段
3. kbd・samp の描き分けと、パスの割り方（7.5）。色相を足さないので原則5に触れない
4. 構文色を 5 値・2 色相にする（7.3-2）。`screen-design.md` 13.2「コードの色付けは同梱のテーマのまま残す」を覆すので、見本の画で作者に問う

## 確かめていないこと

- 7.3・7.4 の候補は計算だけで、画で見ていない。C 0.055 の 2 色が「色」に見えるか、「くすんだ字」に見えるかは目視が要る
- 色覚の模擬（Machado 2009）は、L 0.3 前後の暗い地では精度が落ちる。作者の色覚も確かめていない
- Asenov 2016 の数値は論文の本文ではなく要約から取った【二次】。Hannebauer 2018 は抄録だけで、課題の数と正答率の差は読めていない
- Gilmore & Green 1988 と Hakala 2006 は Sarkar・Dimitri の要約経由で、原著を読んでいない
- Ware の「5〜10 色相」は二次の要約。本の版と頁を確かめていない
- IBM Plex Mono の 600 は latin しか同梱していない。和文のコメント・文字列は代替の書体に落ちるので、太さの段がどう見えるかは見ていない
- hljs が TypeScript の型注釈・JSX・シェルにどの class を付けるかは、JS の文法だけで確かめた
- Notion と Slack のインラインコードは測れなかった（Notion は headless で本文が描かれず、Slack は公開 CSS が無い）。Stripe のガイドの頁はダークにならない。GitHub の README の ```diff の色は測っていない
- ドキュメント製品の構文色の数は 1 つの塊で数えた下限で、テーマの全体ではない

## 出典一覧

1. Advait Sarkar (2015) "The impact of syntax colouring on program comprehension." PPIG 2015, pp. 49–58. https://ppig.org/papers/2015-ppig-26th-sarkar1/ （本文 PDF: https://advait.org/files/sarkar_2015_syntax_colouring.pdf。Gilmore & Green 1988 の要約もここから）
2. Giovanna Maria Dimitri (2015) "The impact of Syntax Highlighting in Sonic Pi." PPIG 2015. https://ppig.org/files/2015-PPIG-26th-Dimitri.pdf （Hakala, Nykyri & Sajaniemi 2006 の要約もここから）
3. Tanya R. Beelders & Jean-Pierre L. du Plessis (2016) "Syntax highlighting as an influencing factor when reading and comprehending source code." Journal of Eye Movement Research 9(1). DOI 10.16910/jemr.9.1.1
4. Dimitar Asenov, Otmar Hilliges & Peter Müller (2016) "The Effect of Richer Visualizations on Code Comprehension." CHI '16. DOI 10.1145/2858036.2858372 （抄録は OpenAlex、数値は https://lacuna.tiptreesystems.com/work/the-effect-of-richer-visualizations-on-code-comprehension/wrk_b4ce3a6281b677615f266877ae7d8c44 の要約【二次】）
5. Christoph Hannebauer, Marc Hesenius & Volker Gruhn (2018) "Does syntax highlighting help programming novices?" Empirical Software Engineering 23(5), 2795–2828. DOI 10.1007/s10664-017-9579-0 （抄録のみ）
6. Kang-il Park ほか (2023) "An eye tracking study assessing the impact of background styling in code editors on novice programmers' code understanding." ICER '23. DOI 10.1145/3568813.3600133
7. Xiaotian Su ほか (2026) "Structure-Aware Rendering: How Code Reveal Shapes Programmers' Visual Attention." arXiv:2609.24616
8. Nicolas P. Rougier (2020) "On the design of text editors." arXiv:2008.06030 / HAL hal-03018466. https://arxiv.org/abs/2008.06030
9. Hillel Wayne (2020-07-20) "Syntax highlighting is a waste of an information channel." https://buttondown.com/hillelwayne/archive/syntax-highlighting-is-a-waste-of-an-information/
10. VS Code "Semantic Highlight Guide." https://code.visualstudio.com/api/language-extensions/semantic-highlight-guide
11. tonsky/sublime-scheme-alabaster（9ee7d87）`Alabaster Dark.sublime-color-scheme`・`Alabaster Dark Mono.sublime-color-scheme`・README。https://github.com/tonsky/sublime-scheme-alabaster ／ Nikita Prokopov (2025-10-15) "I am sorry, but everyone is getting syntax highlighting wrong." https://tonsky.me/blog/syntax-highlighting/
12. raunofreiberg/vesper（9043f38）`themes/Vesper-dark-color-theme.json`. https://github.com/raunofreiberg/vesper
13. zed-industries/zed（56934ec）`assets/themes/one/one.json`・`crates/theme/src/theme.rs`. https://github.com/zed-industries/zed
14. primer/primitives（66e78d3）`src/tokens/functional/color/syntax.json5`・`src/tokens/component/diffBlob.json5`、npm `@primer/primitives@11.10.0` の `dist/docs/functional/themes/*.json`. https://github.com/primer/primitives
15. catppuccin/catppuccin（d09787d）`docs/style-guide.md`、catppuccin/palette `palette.json`. https://github.com/catppuccin/catppuccin
16. rose-pine/rose-pine-site（8ad82e5）`src/content/palette/en`、rose-pine/vscode v2.15.2 `themes/rose-pine-color-theme.json`. https://github.com/rose-pine
17. nordtheme/nord（1cef716）`src/nord.css`、nordtheme/visual-studio-code `themes/nord-color-theme.json`. https://github.com/nordtheme
18. JetBrains/intellij-community（d422387）`platform/platform-resources/src/themes/expUI/expUI_darkScheme.xml`・`themes/islands/IslandSchemeDark.xml`・`DefaultColorSchemesManager.xml`. https://github.com/JetBrains/intellij-community
19. zenbones-theme/zenbones.nvim（8304d8d）`colors/zenwritten.vim`・README、slugbyte/lackluster.nvim（70dd682）. https://github.com/zenbones-theme/zenbones.nvim ／ https://github.com/slugbyte/lackluster.nvim
20. microsoft/vscode（30ca50f）`extensions/theme-defaults/themes/`（2026-dark・dark_modern・dark_plus・dark_vs）、`src/vs/platform/theme/common/colors/editorColors.ts`. https://github.com/microsoft/vscode
21. highlight.js 11.11.2（手元の `node_modules`）`styles/github-dark.css`・`lib/languages/javascript.js`
22. dandavison/delta（3c2269c）`src/color.rs`・`src/cli.rs`. https://github.com/dandavison/delta
23. Wilfred/difftastic（44fe664）`src/display/style.rs`・`src/options.rs`. https://github.com/Wilfred/difftastic
24. gitlab-org/gitlab（e8f2b46）`app/assets/stylesheets/highlight/themes/dark.scss`・`lib/gitlab/color_schemes.rb`. https://gitlab.com/gitlab-org/gitlab
25. Christopher G. Healey (1996) "Choosing Effective Colours for Data Visualization." IEEE Visualization '96 / UBC TR-96-10. https://www.cs.ubc.ca/tr/1996/tr-96-10
26. Harvey S. Smallman & Robert M. Boynton (1990) "Segregation of basic colors in an information display." JOSA A 7(10). DOI 10.1364/josaa.7.001985 （Green & Anderson 1956 の引用もここから）
27. Richard E. Christ (1975) "Review and Analysis of Color Coding Research for Visual Displays." Human Factors 17(6). DOI 10.1177/001872087501700602
28. Colin Ware, _Information Visualization: Perception for Design_（Morgan Kaufmann）。色相の数は https://hampdatavisualization.wordpress.com/2016/02/15/using-color-from-colin-ware/ の要約【二次】
29. Apple Human Interface Guidelines "Color." https://developer.apple.com/design/human-interface-guidelines/color
30. GOV.UK Design System "Colour." https://design-system.service.gov.uk/styles/colour/
31. material-components-android `docs/theming/Color.md`（Using Color Harmonization）、material-color-utilities `typescript/blend/blend.ts`（`harmonize`）. https://github.com/material-components/material-components-android ／ https://github.com/material-foundation/material-color-utilities
32. U.S. Web Design System "State tokens." https://designsystem.digital.gov/design-tokens/color/state-tokens/
33. Ordnance Survey "Guide to cartography: colour"（Imhof の色の規則の要約）https://docs.os.uk/more-than-maps/geographic-data-visualisation/guide-to-cartography/colour 【二次】 ／ Edward Tufte, _Envisioning Information_（1990）5 章
34. GitHub: https://github.com/expressjs/express の README（計算済みスタイル）、github-markdown-css 5.9.0 `github-markdown-dark.css`、`@primer/primitives` `dist/css/functional/themes/dark.css`（CSS を読んだ）
35. Stripe API reference https://docs.stripe.com/api/charges/create （計算済みスタイル。ガイドの頁 https://docs.stripe.com/payments/quickstart はダークにならない）
36. Linear developers https://linear.app/developers/graphql （計算済みスタイル）
37. Next.js docs https://nextjs.org/docs/app/getting-started/layouts-and-pages （計算済みスタイルと頁の CSS 規則。Geist・fumadocs の差分の行）
38. Vercel docs https://vercel.com/docs/functions/quickstart （計算済みスタイル）
39. Tailwind CSS docs https://tailwindcss.com/docs/installation/using-vite （計算済みスタイル）
40. MDN https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array/map と kbd の頁 https://developer.mozilla.org/en-US/docs/Learn_web_development/Howto/Tools_and_setup/What_are_browser_developer_tools （計算済みスタイル）
41. React docs https://react.dev/learn/thinking-in-react （計算済みスタイル）
42. Astro docs https://docs.astro.build/en/guides/markdown-content/ （計算済みスタイル）、Expressive Code `packages/@expressive-code/plugin-text-markers/src/styles.ts`. https://github.com/expressive-code/expressive-code
43. Shiki "Transformers"（`docs/packages/transformers.md`）. https://shiki.style/packages/transformers
44. Rust std doc https://doc.rust-lang.org/std/vec/struct.Vec.html （計算済みスタイル）
45. react-notion-x `src/styles.css`（Notion の再現 CSS）https://cdn.jsdelivr.net/npm/react-notion-x/src/styles.css 【二次】
46. The Chicago Manual of Style Online, Q&A（14.18 の URL の改行）https://www.chicagomanualofstyle.org/qanda/data/faq/topics/URLs/faq0008.html 【二次】
