# 和文を画面で読みやすく組むための具体値（2026-10-02）

**この文書は調査メモであって正典ではない。** `docs/` の他ファイルにある「節の索引」はここには
作らない。レポート（日本語の技術文。識別子・コード・表・図が混ざる）を Orca のタブ（ダークテーマ）で
読むとき、アプリ側の CSS で何をどの値にすべきかを、一次情報に遡って集めた。**決定はしない。**
現行値は `src/browser/styles/theme.css`（本文 15px・行の高さ 1.75・`system-ui`・`overflow-wrap: anywhere`、
`<html lang="ja">`）と `docs/architecture/screen-design.md`「13.3 Type」（行長の上限なし、1400px で約 67 全角）。
Orca のタブは Electron で、同梱の Chromium は手元の Orca 1.4.218 で `Chrome/150.0.7871.250`（`Electron Framework` の
文字列から実測）。**以下のブラウザ対応は Chromium 列が効く。**

## 要点

1. **行長**: JLReq は横組の本文を「最大で 40 字くらい」、JLReq-d 草稿は「30〜35 字」、WCAG 1.4.8 とデジタル庁は「全角 40 字」。
   実験では 20 字付近で読み速度が頭打ち（小林ら 2016）。tsukumo の 67 全角はどの基準の 1.5〜3 倍。
2. **行間**: JLReq は「二分アキ以上、全角アキ以下。35 字を超える行長では全角アキ」＝ `line-height` 1.5〜2.0、長い行なら 2.0 寄り。
   現行 1.75 は 30 字前後の行向けの値（JLReq-d: 30 字で 3/4）。全角アキ以上にしても読みやすくはならない（JLReq）。
3. **大きさ**: デジタル庁は本文 16px 基準・14px 未満は原則不可。暗地に明るい字（負極性）は小さい字ほど不利で、
   8→14pt の範囲で差が線形に拡大（Piepenbrock 2014）。現行は本文 15px・ラベル 11px。
4. **CSS**: `text-autospace` は 3 ブラウザが揃ったが**初期値は全ブラウザ `no-autospace`**（明示しないと効かない）。
   `text-spacing-trim`（Chrome 123）・`word-break: auto-phrase`（Chrome 119、`lang="ja"` 必須）は Chromium だけ。
   `hanging-punctuation` は Safari だけ。`text-wrap: pretty` は Chrome が末尾 4 行、Safari 26 が全行、Firefox 未。
5. **書体（実測）**: `system-ui` は macOS で SF Pro ＋ Hiragino Sans（W0〜W9 同梱）。SF の x-height 0.508em に対し
   Hiragino は 0.545em で、欧文だけ 7% 小さく見える。`font-size-adjust: ex-height 0.545` で SF だけ 1.073 倍になる。
   Hiragino は `palt`/`halt` を持ち `chws`/`tnum` は無い。BIZ UDPGothic は `halt` を持たず `text-spacing-trim` が無効になる。
6. **強調**: JLReq 3.3.9 は圏点のほか書体の変更・色・括弧・傍線を強調手段として挙げる。和文のイタリックは合成斜体になるので
   避ける（デジタル庁）。Hiragino は W6 の実体があるので太字は合成されない。
7. **見出し**: JLReq は 1 段階ずつ（9→10→12→14pt）、デジタル庁は 16→17→18→20→22px。見出しの行間は 1.4〜1.5（デジタル庁）、
   JLReq-d 草稿は字の 1/3〜1/4（＝1.25〜1.33）。現行の 15→17→19→21 と 1.3 はこの範囲。

## 知見

### 1. JLReq と JIS X 4051 のうち画面の本文に効く条

JLReq（W3C Working Group Note、2020-08-11 版）は「主として JIS X 4051（日本語組版規則）に基づく」と冒頭で明記する。
**JIS X 4051:2004 の本文は有料（日本規格協会）で今回は読んでいない。** Web の無料ミラーは目次だけだった。
以下の節番号は JLReq のもの。引用は原典の日本語（句読点は原典どおり「，．」）。

| 条     | 原典の文言（要約せず抜粋）                                                                                                                                                                                                                                                          | 画面への効き                                                 |
| ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| 2.1.3  | 漢字等・平仮名・片仮名は「原則として，文字の外枠を密着させて配置するベタ組にする」                                                                                                                                                                                                  | 本文に `palt`（プロポーショナル詰め）を掛けない根拠          |
| 2.4.2  | 「1 行の行長（字詰め数）は，縦組の場合，最大で 52 字くらい，横組では最大で 40 字くらいにする．…これ以上になる場合は，段組にして，1 行の行長を短くすることが望ましい」                                                                                                               | 横組 40 字が上限の目安                                       |
| 2.4.2  | 「基本版面の行間は，基本版面の文字サイズの二分アキ以上，全角アキ以下の範囲とすることが多い．行長が短い場合は，二分アキでもよい．35 字を超えるような行長では，全角アキか，それよりやや詰めた行間にするのがよい」「行間を全角アキ以上にしたからといって，読みやすくなるわけではない」 | `line-height` 1.5〜2.0。長い行は 2.0 寄り、2.0 超は無意味    |
| 2.4.2  | 「欧文の組版の行間は，文字サイズの三分アキ又はそれ以下とする場合も多い．これと比較すると日本語組版の行間は大きくなる」                                                                                                                                                              | 欧文向け既定（1.2〜1.4）を和文に流用しない根拠               |
| 2.5.1  | ぶら下げ組は「句点類（cl-06）及び読点類（cl-07）に限り，行末の版面の領域の外側に接して配置する」。JIS X 4051 の本体には無く解説 8.1 c）にある。「ぶら下げ組を採用している書籍は多い」                                                                                               | CSS `hanging-punctuation: allow-end` に対応                  |
| 3.1.2  | 始め括弧の前・終わり括弧の後ろ・句読点の後ろは原則二分アキ、「中点類（cl-05）では，原則として前及び後ろを四分アキ」                                                                                                                                                                 | 約物の内側のアキ。CSS `text-spacing-trim` が詰める対象       |
| 3.1.7  | 行頭禁則の対象は終わり括弧類・ハイフン類・区切り約物・中点類・句点類・読点類・繰返し記号・長音記号・小書きの仮名・割注終わり括弧類。注に「々・長音記号・小書きの仮名を行頭に許す緩い規則を採る本も少なくない」、付録 C.3 で 4 段階                                                  | CSS `line-break: strict / normal / loose` の差はこの緩さの差 |
| 3.1.8  | 行末禁則は始め括弧類（と割注始め括弧類）                                                                                                                                                                                                                                            | どのブラウザも既定で守る                                     |
| 3.1.10 | 単位記号（cl-25）とその前の数字の字間は「四分アキとすることが慣習」                                                                                                                                                                                                                 | `4 km` の間の細いアキ。CSS では自動化されない                |
| 3.2.2  | 横組では「原則としてプロポーショナルな欧字を用いる」、全角のモノスペース欧字は「体裁がよくないので，このような文字は使用しない」                                                                                                                                                    | 英数字を全角で書かない                                       |
| 3.2.6  | 図 102「平仮名，片仮名又は漢字等と欧字・アラビア数字の字間を四分アキとした例」。行頭では欧字の前にアキを取らない                                                                                                                                                                    | 和欧間アキの伝統値は 1/4em。CSS `text-autospace` は 1/8      |
| 3.3.9  | 圏点は「漢字等（cl-19）や平仮名（cl-15）などの文字列に付け，その文字列を強調する」。注: 書体の変更（明朝→ゴシック）・色・「」〈〉で括る・傍線（下線）も強調手段で「編集上の判断」                                                                                                   | 太字以外の強調の選択肢                                       |
| 3.5.1  | 段落先頭行の字下げは「その段落で使用している文字サイズの全角アキが原則」。「ほとんどの書籍・雑誌は，この方法を採用」                                                                                                                                                                | 段落の区切りはアキではなく字下げが原型                       |
| 4.1.1  | 「小見出しは，本文の文字サイズ（例：9 ポイント）より 1 段階大きく（例：10 ポイント），中見出しは小見出しより 1 段階大きく（例：12 ポイント），大見出しは中見出しより 1 段階大きくする（例：14 ポイント）」                                                                          | 見出しの比は ×1.11 / ×1.33 / ×1.56                           |
| 4.1.3  | 本文が細い明朝のとき「見出しの文字サイズを大きくしたときは，一般に本文と同じウェイトではやや弱くなるので，ウェイトをやや太いものに変えることも必要」                                                                                                                                | 見出しはサイズとウェイトの両方で差を付ける                   |
| 4.1.6  | 「副題（サブタイトル）の文字サイズは，主見出しの文字サイズの 2/3 くらいがよい」                                                                                                                                                                                                     | 見出し直下の補足行の比                                       |

**JLReq-d（デジタルテキスト向けの後継。未公開の作業草稿）**: W3C の `w3c/jlreq-d` リポジトリの `drafts/`（`gh-pages` 枝）に
日本語の草稿があり、TR も GitHub Pages も空（2026-10-02 時点）。草稿ゆえ出典としては弱いが、画面を直接扱う数値を持つ。

- 4.2.1 望ましい行長: 「最短の行長は，10 字以上が基準」「読みやすいのは横組で 30 字から 35 字くらい」「行長が可変の場合，ある行長を超えた場合は段組にする」
- 4.3.2 行間の選択例: 「35 字以上の場合は文字サイズの 1 倍程度にすると良い。これ以上広げても読みやすさの改善には繋がらない」
  「行長が 30 字程度であれば，文字サイズの 3/4 程度」「20 字以下であれば文字サイズの ½ 程度」「キャプションや見出し…は 1/3，あるいは 1/4」
- 4.2 書体デザイン（小さい文字サイズ）: 「懐の大きさが大きめのデザインが読みやすい」「ウェイトはレギュラーなど細目のものが潰れにくい」
  「仮名の平均的な字面は漢字の平均的な字面に比べて約 80%」
- 3.3 段落: 「ブロック段落（字下げせず段落間を空ける）…デジタルデバイスではこの方式が多く使われている」。字下げ段落なら全角 1 字

### 2. CSS の和文向け機能とブラウザ対応（2026-10-02 の MDN browser-compat-data）

| プロパティ / 値                          | Chromium | Safari                 | Firefox        | 備考                                                                                                                       |
| ---------------------------------------- | -------- | ---------------------- | -------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `text-autospace`                         | 140      | 18.4                   | 145            | 3 つとも**初期値 `no-autospace`**（仕様は `normal`。csswg-drafts #12386 が未決）。Chrome は `normal` / `no-autospace` のみ |
| `text-spacing-trim`                      | 123      | 未                     | 未             | 初期値 `normal`。`space-first` / `trim-start` / `space-all`。WebKit は bug 252068                                          |
| `word-break: auto-phrase`                | 119      | preview                | 未             | `lang="ja"`（と `ko`）だけに効く。日本語は BudouX（機械学習、JS 版は約 15 KB）                                             |
| `line-break: strict / loose`             | 58       | 11                     | 69             | `auto` は UA が行長で変えてよい（CSS Text 4）                                                                              |
| `hanging-punctuation`                    | 未       | 10（26.5 で完全）      | 未             | `allow-end` / `force-end` が 、。，． を行末にぶら下げる                                                                   |
| `text-wrap: balance`                     | 114      | 17.5                   | 121            | 見出し向け                                                                                                                 |
| `text-wrap: pretty`                      | 117      | 26                     | 未             | Chrome は「末尾 4 行だけ」、WebKit は「全行」（WebKit blog）                                                               |
| `font-size-adjust`                       | 127      | 16.4（`from-font` 17） | 3（2 値は 92） | フォールバック書体の x-height を揃える（CSS Fonts 4 §2.6 の意図）                                                          |
| `font-feature-settings` / `font-kerning` | 48 / 33  | 9.1 / 9                | 34 / 32        | `"palt"` は書体に機能があるときだけ                                                                                        |
| `font-variant-numeric: tabular-nums`     | 52       | 9.1                    | 34             | 書体に `tnum` が要る（下の実測）                                                                                           |
| `text-emphasis`（圏点）                  | 99       | 7                      | 46             | 横組の既定は `filled` → 丸、位置は日本語なら `over right`（CSS Text Decoration 3）                                         |
| `font-synthesis`                         | 97       | 9                      | 34             | 太字・斜体の合成を止める                                                                                                   |
| `overflow-wrap: anywhere`                | 80       | 15.4                   | 65             | `break-word` と違い min-content の計算にも効く（表が縮む原因）                                                             |

- **`text-autospace`** が入れるアキは「CJK の全角幅の 1/8（0.125ic）」。仕様の注は「慣習は 1/4ic〜1/8ic、プロポーショナル組では 1/6ic 以下が多い」ので
  JLReq の四分より控えめ。Chrome は「既に ASCII スペースがあれば入れない」（Chrome blog）。
- **`text-spacing-trim`** は MDN の注に「書体に `halt` か `chws` が無ければ無効」。Chrome 123 から初期値 `normal` で効いているので、
  Hiragino Sans（`halt` あり）では既に働いている。パックが書体を持ち込むときは `halt` の有無で挙動が変わる。
- **`word-break: auto-phrase`** は Chrome blog が「意図どおりにならないことがあり `<wbr>` や U+200B で直す」と注意している。
- **`lang="ja"`** は W3C i18n の FAQ が「UA は言語で書体を選ぶ。日中韓は同じ符号位置でも期待する字形が違う」「ハイフネーションは言語宣言が前提」と
  説明する。`auto-phrase` も `lang` 必須。現状 `server.ts` が `<html lang="ja">` を出している。

### 3. 本文の数値の指針

**1 行の文字数（全角）**

| 出典                                                                     | 値                                                                                          | 性質                                         |
| ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------- | -------------------------------------------- |
| JLReq 2.4.2                                                              | 横組は最大 40 字くらい、超えるなら段組                                                      | 書籍の規範（一次）                           |
| JLReq-d 草稿 4.2.1                                                       | 横組 30〜35 字、最短 10 字                                                                  | 草稿（一次だが未公開）                       |
| WCAG 2.1 SC 1.4.8（AAA）                                                 | 「80 文字以下（CJK は 40）」、両端揃えしない                                                | 一次                                         |
| デジタル庁 タイポグラフィ（アクセシビリティ）                            | 「半角 80 文字（全角 40 文字）程度を目安」                                                  | 一次（WCAG 1.4.8 を引く）                    |
| 小林・関口・新堀・川嶋 2016（電子情報通信学会論文誌 D, J99-D(1), 23–34） | 5〜40 字を比べ、読み速度は「20 字付近で上限に近づく」、視線移動を含め 20〜29 字が読みやすい | 一次の論文。読んだのは著者研究室の要約ページ |
| 宮崎・玉垣・大橋 1987（デザイン学研究 63）                               | 新聞本文は「1 行 20 字詰め，行間 1/2 が最適」                                               | 一次（J-STAGE 抄録）                         |

tsukumo の実測: 15px で 1400px の窓なら約 67 全角。40 全角 = 600px（16px なら 640px）、45 全角 = 675px。

**行間（`line-height`）**

| 出典               | 値                                                                                                                                             |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| JLReq 2.4.2        | 行間 = 二分〜全角 → `line-height` 1.5〜2.0。35 字超は全角か少し詰める → 1.9〜2.0                                                               |
| JLReq-d 草稿 4.3.2 | 35 字以上 2.0 / 30 字 1.75 / 20 字以下 1.5 / 見出し・キャプション 1.25〜1.33                                                                   |
| デジタル庁         | 本文は「少なくとも 1.5 倍を維持」。150% 最低限、160% 一般、170%・175% は「心理的負荷の軽減を考慮」。見出し 140%、等幅 150%、管理画面 120〜130% |
| WCAG 1.4.12（AA）  | 行の高さ 1.5 倍・段落間 2 倍・字間 0.12em・語間 0.16em に利用者が変えても壊れないこと                                                          |
| WCAG 1.4.8（AAA）  | 行送りは 1.5 以上、段落間は行送りの 1.5 倍以上                                                                                                 |

**段落間のアキ**: JLReq は字下げ全角（アキなし）、JLReq-d 草稿は「デジタルではブロック段落が多い…段落間スペースは任意の量か 1 行分」。
デジタル庁は「段落間を行ボックスの高さの 1.5 倍以上（フォントサイズの 2.25 倍以上）」。tsukumo の段落の `margin` は 0.5〜0.75rem（8〜12px）で、
行の高さ 26.25px（15px × 1.75）の 0.3〜0.46 行分。

**本文の大きさ**: デジタル庁は「本文や UI においては 16 CSS px 以上が基準」「14 CSS px 未満の大きさの使用は原則として許容されません」。
Piepenbrock ら 2014（Human Factors）は 8・10・12・14pt の白黒双方で校正課題を行い「正極性（白地に黒）の優位は文字が小さくなるほど線形に拡大」、
「特に小さい文字では負極性（黒地に白）を避けるべき」と結論している。字が小さいほど暗地の不利が増す、という量的な根拠はこれだけだった。

**見出しとの比**: JLReq 4.1.1（9→10→12→14pt）、デジタル庁 Std（16→17→18→20→22→24→26→28→32→36→45px、見出しは行高 140〜150%、字間 0〜2%）。
現行 15→17→19→21px（×1.13 / ×1.27 / ×1.40）は両者の刻みの中。

**和文と欧文の大きさの差（実測）**: `system-ui` では欧文が SF Pro、仮名漢字が Hiragino Sans で描かれる。SF Pro の x-height は 0.508em、
Hiragino Sans W3 は 0.545em（Hiragino 自身の欧文）。同じ `font-size` で欧文の小文字が 7% 低い。`font-size-adjust: ex-height 0.545` を置くと
Hiragino は 1.0 倍のまま SF が 1.073 倍になり、大文字の高さも 0.705 × 1.073 = 0.757em で Hiragino の 0.766em に揃う（CSS Fonts 4 §2.6
「フォールバックが起きたとき x-height を同じにして可読性を保つ」が本来の用途）。`from-font` だと主書体 SF の 0.508 に Hiragino を縮めてしまうので逆効果。

### 4. 書体の選択

**暗地に明るい字（負極性）**

- Piepenbrock ら 2013（Ergonomics）: 若年・高齢とも正極性が有利。2014（Ergonomics）: 正極性では瞳孔が小さく網膜像が鋭い。
  Dobres ら 2017（Applied Ergonomics）: 暗い環境の負極性が最も読みにくく、明るい環境では差が消えた。
  → **暗地は不利を前提に、字を小さくしない・コントラストを落とさない**が量的根拠のある対策。
- Apple HIG（Dark Mode）: 「コントラスト比は最低 4.5:1。独自の前景色・背景色は 7:1 を目指す、特に小さい字で」「白地の画像は少し暗くして光らないように」。
  現行の `--ink` #e8e3ea / `--surface` #221f2b は 12.8:1、`--ink-quiet`（60%）は 5.5:1、目録の #9a98a6 は 5.7:1（WCAG の式で計算）。
- **「暗地では字が太って見えるのでウェイトを 1 段落とす」の一次情報は見つからなかった**（HIG・W3C・論文に無し。Material の該当ページは
  JS 描画で取得できず）。近いのは JLReq-d 草稿「小さい字ではレギュラーなど細目のウェイトが潰れにくい」で、極性には触れていない。

**UD フォントの可読性研究（モリサワ／慶應義塾大学 中野泰志研究室）**

- 2013 報告（紙）: UD 書体は比較書体より「判別しやすく，情報などを効率的に読むことができる」。
- 2016 報告（デジタル）: iPad Air、視力条件 3 つ（平均視力 1.04 / すりガラス 0.176 / 白濁ゴーグル 0.212）。「横書きではすべての視力条件において，
  ゴシック体が優位であり，その中でも UD ゴシック体が上位」、縦書きは UD 新丸ゴ・UD 新ゴが上位。弱視者 15 人でも同じ。
  付録: すりガラス条件では「デジタルデバイスは紙よりも小さな文字まで読むことができ」、他の条件では紙と差なし。
- 大阪医科薬科大学 LD センター: 読み書き困難の小学生 33 人で UD デジタル教科書体は読み速度 9% 改善（対象が限定的）。
- Web で使えるのは BIZ UDGothic / UDPGothic（OFL、Google Fonts、Regular と Bold のみ）。UD デジタル教科書体は OFL 配布が無く Google Fonts にも無い。

**候補書体の実測（fontTools 4.60.2、Google Fonts の配布ファイルと macOS Tahoe の同梱書体、2026-10-02）**

| 書体                         | 配布                 | ウェイト            | 容量      | 字数   | `line-height: normal` | x-height | 「あ」の高さ | 「国」の幅×高さ | 数字                                          | 主な機能                              |
| ---------------------------- | -------------------- | ------------------- | --------- | ------ | --------------------- | -------- | ------------ | --------------- | --------------------------------------------- | ------------------------------------- |
| Hiragino Sans W3             | macOS 同梱（W0〜W9） | 10 段の静的         | 7.9MB/段  | 20,339 | 1.50                  | 0.545    | 0.854        | 0.834×0.869     | ほぼ等幅（0.657/0.661）                       | kern palt pkna pwid halt vhal         |
| SF Pro（`system-ui` の欧文） | macOS 同梱           | 可変                | 7.9MB     | 2,943  | 1.18                  | 0.508    | —            | —               | プロポーショナル、`tnum` あり                 | kern tnum pnum liga                   |
| Noto Sans JP                 | Google Fonts         | 可変 100〜900       | 9.15MB    | 17,936 | 1.45（hhea）          | 0.543    | 0.844        | 0.828×0.875     | 等幅 0.555、`tnum` 無し                       | kern palt pwid halt vhal locl         |
| IBM Plex Sans JP             | Google Fonts         | 100〜700 の 7 段    | 2.3MB/段  | 9,505  | 1.50                  | 0.541    | 0.847        | 0.846×0.883     | 等幅 0.63                                     | kern palt pwid halt vhal              |
| LINE Seed JP                 | Google Fonts（OFL）  | 100/400/700/800     | 3.5MB/段  | 9,225  | 1.10                  | 0.509    | 0.859        | 0.823×0.851     | プロポーショナル（0.466〜0.725）、`tnum` 無し | kern palt pwid halt vhal              |
| Zen Kaku Gothic New          | Google Fonts         | 300/400/500/700/900 | 2.2MB/段  | 7,792  | 1.45                  | 0.479    | 0.857        | 0.814×0.836     | プロポーショナル（0.383〜0.509）、`tnum` 無し | kern のみ                             |
| M PLUS 2                     | Google Fonts         | 可変 100〜900       | 4.01MB    | 6,960  | 1.45                  | 0.520    | 0.857        | 0.846×0.870     | 等幅 0.633、`tnum`/`pnum` あり                | kern tnum pnum locl                   |
| BIZ UDPGothic                | Google Fonts         | 400/700             | 4.45MB/段 | 13,932 | 1.00                  | 0.541    | 0.874        | 0.852×0.897     | プロポーショナル（0.63/0.76）、`tnum` 無し    | zero liga のみ（palt/halt/kern 無し） |

読み方: 字面（「あ」「国」の寸法、em 比）は BIZ UDPGothic が最も大きく、Noto Sans JP が最も小さい。仮名と漢字の字面差はどの書体も数%
（「あ」/「国」の幅で 0.93〜0.97）で、JLReq-d 草稿が明朝体の見本から出した「約 80%」より小さい。`line-height: normal` は 1.0〜1.5 と
ばらつくので和文は必ず数値で指定する。`text-spacing-trim` が効くのは `halt` を
持つ Hiragino・Noto・Plex・LINE Seed だけ。数字を縦に揃えたい表では `tnum` を持つのが SF Pro と M PLUS 2 だけで、BIZ UDP・Zen Kaku・LINE Seed は
プロポーショナル固定。可変フォント 1 本で 9 段を賄えるのは Noto と M PLUS 2。LINE Seed JP は配布元が「4 ウェイト、SIL OFL」。

**等幅コードとの組み合わせ**: `ui-monospace` は SF Mono（x-height 0.526、数字等幅 0.618、`line-height: normal` 1.18）。Hiragino の全角 1.0em に対し
SF Mono の半角は 0.618em で 1:2 にならない。和文を含むコード向けの合成書体は半角:全角を 1:2 か 3:5 に固定している
（UDEV Gothic = BIZ UD ゴシック + JetBrains Mono、PlemolJP = IBM Plex Sans JP + IBM Plex Mono、Moralerspace = Monaspace + Plex Sans JP。いずれも yuru7 の GitHub）。

**macOS 既定（Hiragino）との比較**: 外部フォントを足さない方針（screen-design 13.3）のもとでは Hiragino Sans が本文になる。Hiragino は候補の中で
字数が最多、`palt`/`halt` を持ち、W0〜W9 の実体ウェイトがあるので太字が合成されない。足りないのは `tnum`（数字は元からほぼ等幅）と `chws`。
Web フォントを 1 本足すと最小でも 2.2MB（Zen Kaku 1 段）、可変なら 4〜9MB で、ネットワークへ出ない方針と衝突する。

### 5. 見出し・強調・箇条書きの作法

- **太字**: JLReq 4.1.3 はウェイトで見出しを立てる。`system-ui` なら Hiragino に W6 などの太い実体があるので太字は合成されない（700 がどの W に
  当たるかは未確認）。パックの書体が 1 段しか無ければ `font-synthesis` 既定で合成太字になる（CSS Fonts 4 §2.8「字の周りに細い線を引いて合成する…専用に設計された面の品質には達しない」）。
- **太字の代替**: JLReq 3.3.9 の列挙（書体の変更・色・括弧・傍線）が原典。CSS では圏点 `text-emphasis: filled`（横組は丸、日本語の位置は `over right`）が
  3 ブラウザで使える。デジタル庁は「日本語フォントは通常イタリック体を持たない…傾けただけの斜体となり可読性に劣る」として和文イタリックを避け、
  下線は「リンクテキストのデフォルト…色のみで表現してしまうことを避けるためにも重要」とリンクに留める。
- **見出しのサイズ階層**: 「和文は欧文ほど差を付けなくてよい」を直接述べる一次情報は見つからなかった。あるのは JLReq 4.1.1 の 1 段階刻み
  （本文 9pt に対し 10 / 12 / 14pt）と、JLReq 4.1.3・4.1.6 がサイズ以外（ウェイト・行取り・副題 2/3）で差を付けていること。
- **見出しの行間と字間**: デジタル庁は 20〜32px で行高 150%、36px 以上で 140%、字間は 16〜26px が 2%、28〜36px が 1%、45px が 0。JLReq-d 草稿は
  「文字を大きくした場合，字間が空きすぎに感じられるときがあり，字間を詰める」「強調のために字間を空ける」。
- **記号・ラベル**: 中点の前後 1/4em（JLReq 3.1.2）と数字と単位の間 1/4em（3.1.10）は CSS が自動化しない（`text-spacing-trim` は約物同士の
  重なりだけ、`text-autospace` は和欧間だけ）。小さなラベルの字間を広げる現行の `letter-spacing: 0.08em`（11px）は、デジタル庁の本文上限 2% より
  大きいが JLReq-d 草稿の「強調のために字間を空ける」用途に当たる。

## tsukumo に効く示唆（値と根拠。採否は別途）

```css
/* 1. 行長か行間のどちらかを JLReq に合わせる（現状は 67 全角 × 1.75）。
   40〜45 全角の上限を段落・箇条書き・引用だけに掛ければ表・コード・図は広がれる（42 全角の上限を撤回した理由「表がつぶれる」に当たらない）。
   pretty は Chromium 117 で末尾 4 行の 1 字落ちを防ぐ。strict は JLReq 3.1.7 の基本規則（長音・小書き仮名を行頭に置かない） */
.detail-block :is(p, li, blockquote) {
  max-inline-size: 45em;
  text-wrap: pretty;
  line-break: strict;
}
/* 行長を保つなら、35 字超の行として JLReq 2.4.2・JLReq-d 4.3.2 の「全角アキ」に寄せる */
:root {
  --line-height-body: 1.9;
}
/* 2. 和欧間アキ（3 ブラウザとも初期値が no-autospace。CSS Text 4 §8.4.1: 1/8ic。pre では no-autospace に戻して桁を守る）、
   欧文の小ささの補正（実測: SF Pro 0.508 / Hiragino 0.545。パックが書体を差し替えたら値も差し替える）、
   斜体の合成を止めて太字の合成だけ許す */
body {
  text-autospace: normal;
  font-size-adjust: ex-height 0.545;
  font-synthesis: weight;
}
/* 3. 見出しは行を揃え、文節で折る（auto-phrase は Chromium 119、lang="ja" 必須。吹き出し・表のセルのような短い行にも向く） */
:is(h1, h2, h3, h4) {
  text-wrap: balance;
  word-break: auto-phrase;
}
/* 4. 数字の列。system-ui の数字は SF Pro なので tnum が効く。BIZ UDP・Zen Kaku・LINE Seed では効かないので等幅書体へ逃がす */
td.numeric {
  font-variant-numeric: tabular-nums;
}
/* 5. 太字の代わりの圏点（横組は丸。位置の初期値は over right）。選択子は例 */
em.jp {
  text-emphasis: filled;
  font-style: normal;
}
```

- **やらないほうがよいもの**: 本文への `font-feature-settings: "palt"`（JLReq 2.1.3 のベタ組に反し、`text-spacing-trim` と役割が重なる。大きい見出しだけ）、
  `hanging-punctuation`（Chromium 未対応で、書いても効かない）、`line-height` 2.0 超（JLReq「読みやすくなるわけではない」）。
- **大きさ**: 本文 15px はデジタル庁の 16px 基準を 1px 下回り、ラベル 11px・入口 12px・補助 13px は「14px 未満は原則不可」に当たる。
  暗地で小さい字ほど不利（Piepenbrock 2014）なので、下げるなら段を増やさず 11→12 / 13→14 の繰り上げを候補にする。段は 9 つのまま。
- **段落のアキ**: 現行 8〜12px は WCAG 1.4.8（行送りの 1.5 倍）・デジタル庁（行高の 1.5 倍）より小さい。ブロック段落で行くなら
  `margin-block: 0 1em` 以上（JLReq-d「1 行分」なら `1.75em`）、字下げで行くなら `text-indent: 1em` でアキは要らない（JLReq 3.5.1）。
- **`text-spacing-trim`** は Chromium 123 以降の初期値で既に効いているので触らない。パックの書体が `halt` を持たないと黙って無効になるので、
  `character-pack.md` の「書体を同梱するとき」に `halt` の有無を書いておくと差が説明できる。
- **`overflow-wrap: anywhere`** を `body` に置くと min-content が縮んで表が 1〜2 字折りになる（CSS Text 4: `anywhere` は min-content に効き
  `break-word` は効かない）。`.table-scroll td { overflow-wrap: break-word }` に切り替えれば `min-width: 4em` の補助が要らなくなる可能性がある（未検証）。
- 描画に関わるので、採るときは `docs/architecture/testing.md`「手で確かめること」の手順で、長い段落・表・コード混在のレポートを目視する。

## 出典一覧

一次（◎）は原典・ベンダー・提供元・論文、二次（○）は要約ページ。

- ◎ W3C, Requirements for Japanese Text Layout (JLReq), WG Note 2020-08-11: https://www.w3.org/TR/jlreq/
- ◎ W3C `w3c/jlreq-d` 作業草稿（`gh-pages` 枝 `drafts/`、未公開）: https://github.com/w3c/jlreq-d
- ◎ JIS X 4051:2004（有料。未閲覧。JLReq が「主として基づく」と明記）。目次のみ: https://kikakurui.com/x4/X4051-2004-01.html
- ◎ CSS Text Module Level 4（`text-spacing-trim` / `text-autospace` 8.4.1 / `line-break` / `hanging-punctuation` / `word-break`）: https://drafts.csswg.org/css-text-4/
- ◎ CSS Fonts Module Level 4 §2.6 `font-size-adjust`・§2.8 合成: https://drafts.csswg.org/css-fonts-4/
- ◎ CSS Text Decoration Level 3 `text-emphasis`: https://drafts.csswg.org/css-text-decor-3/
- ◎ MDN browser-compat-data（`css/properties/*.json`、2026-10-02 取得）: https://github.com/mdn/browser-compat-data
- ◎ MDN `text-spacing-trim`（`halt`/`chws` が無いと無効）: https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/text-spacing-trim
- ◎ csswg-drafts #12386（`text-autospace` の初期値）: https://github.com/w3c/csswg-drafts/issues/12386
- ◎ Chrome: Introducing four new international features in CSS: https://developer.chrome.com/blog/css-i18n-features
- ◎ Chrome: CSS `text-wrap: pretty`: https://developer.chrome.com/blog/css-text-wrap-pretty
- ◎ blink-dev Intent to Ship `text-spacing-trim`: https://www.mail-archive.com/blink-dev@chromium.org/msg09073.html
- ◎ blink-dev Intent to Ship `text-autospace`: https://www.mail-archive.com/blink-dev@chromium.org/msg13900.html ／ Chrome Status: https://chromestatus.com/feature/5202578236768256
- ◎ WebKit Features in Safari 18.4（`text-autospace`）: https://webkit.org/blog/16574/webkit-features-in-safari-18-4/
- ◎ WebKit: Better typography with text-wrap pretty: https://webkit.org/blog/16547/better-typography-with-text-wrap-pretty/
- ◎ WebKit Features in Safari 26.0: https://webkit.org/blog/17333/webkit-features-in-safari-26-0/
- ◎ Firefox 145.0 Release Notes（2025-11-11）: https://www.firefox.com/en-US/firefox/145.0/releasenotes/
- ◎ Google BudouX: https://github.com/google/budoux
- ◎ W3C i18n FAQ: Why use the language attribute?: https://www.w3.org/International/questions/qa-lang-why
- ◎ WCAG 2.1 Understanding 1.4.8 Visual Presentation: https://www.w3.org/WAI/WCAG21/Understanding/visual-presentation.html
- ◎ WCAG 2.1 Understanding 1.4.12 Text Spacing: https://www.w3.org/WAI/WCAG21/Understanding/text-spacing.html
- ◎ デジタル庁デザインシステム タイポグラフィ（概要、2026-08-05 更新）: https://design.digital.go.jp/foundations/typography/
- ◎ 同 アクセシビリティ: https://design.digital.go.jp/dads/foundations/typography/accessibility/
- ◎ Apple HIG Dark Mode: https://developer.apple.com/design/human-interface-guidelines/dark-mode
- ◎ Apple: Fonts included with macOS Tahoe: https://support.apple.com/en-us/122869
- ◎ Piepenbrock, Mayr, Mund, Buchner 2013, Ergonomics, doi:10.1080/00140139.2013.790485（PMID 23654206）
- ◎ Piepenbrock, Mayr, Buchner 2014, Human Factors, doi:10.1177/0018720813515509（PMID 25141597）
- ◎ Piepenbrock, Mayr, Buchner 2014, Ergonomics, doi:10.1080/00140139.2014.948496（PMID 25135324）
- ◎ Dobres, Chahine, Reimer 2017, Applied Ergonomics 60:68–73, doi:10.1016/j.apergo.2016.11.001（PMID 28166901）
- ◎ 小林潤平・関口隆・新堀英二・川嶋稔夫 2016, 電子情報通信学会論文誌 D J99-D(1):23–34, doi:10.14923/transinfj.2015HAP0014
  ○ 要約（著者研究室）: https://www.kbys-lab.org/archives/1077
- ◎ 宮崎紀郎・玉垣庸一・大橋徹 1987, デザイン学研究 63:35–42（J-STAGE 抄録）: https://www.jstage.jst.go.jp/article/jssdj/1987/63/1987_KJ00007024938/_article/-char/ja/
- ◎ モリサワ UD 書体の実験・研究: https://www.morisawa.co.jp/fonts/udfont/study/
- ◎ モリサワ／慶應義塾大学 2016 デジタルデバイス比較研究報告（PDF）: https://www.morisawa.co.jp/fonts/udfont/data/UDFontResearchReport_1606.pdf
- ◎ Google Fonts 配布物（`ofl/notosansjp`・`ibmplexsansjp`・`lineseedjp`・`zenkakugothicnew`・`mplus2`・`bizudpgothic` の METADATA.pb と ttf）: https://github.com/google/fonts
- ◎ LINE Seed: https://seed.line.me/index_jp.html
- ◎ UDEV Gothic / PlemolJP / Moralerspace（yuru7）: https://github.com/yuru7/udev-gothic ／ https://github.com/yuru7/PlemolJP ／ https://github.com/yuru7/moralerspace
- 実測: 手元の macOS Tahoe の `/System/Library/Fonts/`（Hiragino Sans W0〜W9・SFNS.ttf・SFNSMono.ttf）と上記 ttf を fontTools 4.60.2 で読んだ値。
  Orca 1.4.218 の `Electron Framework` から `Chrome/150.0.7871.250`。コントラスト比は WCAG 2.1 の相対輝度式で計算
