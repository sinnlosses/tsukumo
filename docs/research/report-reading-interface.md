# 長いレポートを画面で読むときの案内と形式 — 目次・参照・経過・伸びる文書の先例（2026-10-18）

**この文書は調査の記録であって正典ではない。** `docs/` の他ファイルにある「節の索引」はここには作らない。
正典は `docs/architecture/display.md`（各表示物のメインビュー・札の中の並び）と `docs/architecture/screen-design.md`
（13.4 のやり取りの列・13.13 の進み具合の帯と知らせの行）で、**採用が決まるまでコードは1行も変わらない**。

**主題**: 紙面の字組みではなく、長い文書を画面で読むときの**補助と形式**——目次と居場所、1本か畳むかタブか2段か、
参照の見せ方、中間と最終の関係、伸びている文書の読む位置、幅への応答、読む時間の定義。
既存の調査とは重ねない（引くだけ）: 走り読み・結論先行・畳む基準は `report-structure-for-skimming-readers.md`、
認知負荷と図は `comprehension-science-for-reports.md`、字の段・余白の柱の寸法は `beautiful-explanation-design-precedents.md`、
和文の組みは `japanese-screen-typography.md`、エージェント製品と GitHub の merge box・Outline は `agent-report-ui-patterns.md`、
演出の速さの研究は `report-block-craft.md`。10-17 の提案書 `report-excellence-strategy.md` で決まった値は繰り返さない。

**出典の印**: 無印は一次情報（原著・公式の文書・公式の配布物）。**【実測】**は 2026-10-18 に headless Chromium（playwright-core 1.63）で
窓 760〜1920×900 を測った値と、手元の CLI を打った結果。**【二次】**は二次情報でしか照合できなかったもの。**【換算】**は私の計算、
**【推測】**は根拠の無い見積もり。[n] は末尾の出典一覧の番号。

## 要点（10行以内）

1. **概観＋詳細（目次を脇に常に出す）は、線形の1本より理解が良く好まれる**（作文の評点 2.47 対 2.00、20人中19人が選好）。畳んで縮める形は 16% 速いが付随の記憶を落とす [6]。tsukumo のやり取りの列はこの形で、外す理由は無い
2. docs サイト8つは目次を**sticky の列（181〜300px）**に置き、窓が狭まると**本文の幅を保ったまま目次から先に消す**（消える境は 900〜1440px）。8つ中6つでいまの節の強調（scroll-spy）を確かめた【実測】
3. tsukumo の穴は**列を畳んだあとに居場所を言う口が無いこと**。スクロールは位置の手がかりを失わせ、作業記憶の低い読み手の理解を下げる [7] [8]。先例は sticky の題（GitHub）・sticky scroll（VS Code）[28] [32]
4. **中間と最終**: 進行中は新しい順で終わったら時系列に反転（Guardian の CMS）[24]、最新は概要に・履歴は別の口（Linear）[26]、同じ文脈は置き換え（Buildkite）[27]、結論だけを本流へ（Slack）[29]。tsukumo は「依頼→畳んだ中間→最終」で**最終が下**
5. **読み返しの位置**: Slack の既定は「続きから」[29]、見た場所の印は再訪を速くする（Footprints scrollbar）[14]、GitHub は「前回から変わった」の札 [28]。tsukumo はやり取りを移ると先頭に戻る
6. **参照のプレビュー**: Wikipedia の公式 A/B で閲覧 −3〜5%・触れたページ +20〜22%・戻る −2〜9%・無効化 0.01% [15]。色の付いた語は飛ばされにくく、見慣れない語では読み返しが増える [16]
7. `path:line` は VS Code・Warp が行まで運ぶ [20] [21]。**Orca 1.4.227 の `file open` には行の口が無い**【実測】[23]
8. 形式: タブは「並列で、同時に見ない」中身だけ [4]。決まった欄の要約は情報量と読みやすさで勝つが、実物での探す速さの利は出ていない（31研究）[12]
9. 読む時間の先例は割り込みを除く定義（見えている時間 [42]・操作から5秒 [44]・不在を除く [43]）で、小標本の中心は幾何平均 [45]

## 1. 知見: 文書の中の案内（目次・いまの節・sticky・読む位置）

| 知見（数と条件）                                                                                                                                                                                                                                                                                                                                                                     | 出典 |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---- |
| 目次の置き場: 本文の中は「とても一般的・どの幅にも合う」、左の列は「とても一般的・2段以上の配置だけ」、右の列は「少ない・right-rail blindness を受けやすい」。**列なら sticky、本文の中なら sticky にしない**。sticky の目次では「いまの節を強調して居場所を示すことを考える」                                                                                                       | [1]  |
| 目次の狭い画面の形は3つ: 本文の頭へ移す・見出しを accordion にする・畳める sticky の目次（見えにくさが懸念）。目次の項目は見出しを飛ばさない                                                                                                                                                                                                                                         | [1]  |
| 同じページ内のリンクは「リンクは別のページへ行く」という心の型に反する。「On this page」と名を付け、リンクの字を見出しと同じにし、長い中身にだけ使う。sticky の案内には居場所を示し、sticky のものが見出しを隠さないように                                                                                                                                                           | [2]  |
| sticky の頭は小さく・不透明に・動きは無しか短く（出し入れするなら 300〜400ms）、そもそも要るかを問う                                                                                                                                                                                                                                                                                 | [3]  |
| 線形・fisheye（重要でない節を 25% に縮め、要旨と見出しは常に出す）・概観＋詳細（見出しを固定の大きさで並べた概観の窓＋本文）を 20人で比較。**作文の評点は概観＋詳細 2.47（線形 2.00・fisheye 1.95、p<.05）**。fisheye は作文で 16% 速いが、付随の問いの正答が 0.78〜1.16 問少ない。概観＋詳細は問答で 20% 遅い。**19人が概観＋詳細を選び**、10人が「構造と題が見える」を理由に挙げた | [6]  |
| スクロールで読む形は、込み入った話題の理解を下げ、**作業記憶の容量が低い読み手で特に**下がる（ページ送りの形と比較）                                                                                                                                                                                                                                                                 | [7]  |
| ページ送りはスクロールより、全体の心的表象・情報の位置の把握・要旨の記憶が良く、書き直しでも大域の修正が増えた                                                                                                                                                                                                                                                                       | [8]  |
| スクリーンリーダーの利用者が長いページで最初にするのは「見出しをたどる」**71.6%**（通読 6.4%・検索 13.6%。1,539人、2023-12〜2024-01）                                                                                                                                                                                                                                                | [13] |
| Word と Adobe Reader の 120日のログで、人は文書の中の**同じ場所へ頻繁に戻る**。スクロールバーに見た場所の印を付けると再訪の時間が減り、印が多くても使え、強く好まれた                                                                                                                                                                                                                | [14] |
| GitHub は Issue と PR の題と状態を sticky の頭に残す（2019-01、「長い会話を転がすときに文脈を与える」）                                                                                                                                                                                                                                                                              | [28] |
| VS Code の sticky scroll（1.70、2022-07）は、いまの位置を含む入れ子の範囲の頭の行を編集面の上に積む。行数の上限の既定 5【二次】                                                                                                                                                                                                                                                      | [32] |
| 節を移るキー: Vim は `[[` `]]` で節、`{` `}` で段落を移る                                                                                                                                                                                                                                                                                                                            | [33] |
| Notion は 2024-06 から、見出しのあるページで「右の側に hover すると」浮かぶ目次が出る                                                                                                                                                                                                                                                                                                | [31] |
| 読む進みの棒（reading progress bar）の効果を測った実験は見つからなかった（2回探した）                                                                                                                                                                                                                                                                                                | —    |

### 1.1 docs サイトの目次【実測】[46]

窓の高さ 900、幅を 760・900・1024・1100・1200・1280・1440・1600・1920 に変えて、同じページ内の見出しへのリンクを4本以上持ち
幅 380px 未満の器を目次とみなした。いまの節の強調は 1440 幅で文書の 15%・40%・70% の高さへ転がし、他と違う字の色・太さ・`aria-current` を持つ行を拾った。

| サイト      | 目次が出る窓幅           | 目次の幅・置き場（1440）                        | 字     | 頭の固定 | いまの節の強調                    | 本文の段落の幅（1440 / 1920） |
| ----------- | ------------------------ | ----------------------------------------------- | ------ | -------- | --------------------------------- | ----------------------------- |
| MDN         | 全幅（狭いと形を替える） | 181px・右（900〜1024 は左の列、760 は本文の頭） | 16px   | sticky   | あり（節が進むと替わる）          | 768 / 768                     |
| Quarto      | 760 < 境 ≦ 900           | 300px・右（狭いと 227px）                       | 14.9px | sticky   | あり（`active`・色）              | 788 / 799                     |
| Docusaurus  | 900 < 境 ≦ 1024          | 228px・右（窓に比例 124〜273）                  | 12.8px | sticky   | あり（色）                        | 823 / 958                     |
| Linear docs | 1024 < 境 ≦ 1100         | 242px・右                                       | 13px   | sticky   | 3点で替わらず                     | 650 / 650                     |
| Stripe docs | 1200 < 境 ≦ 1280         | 202px・右                                       | 14px   | sticky   | 測れず（本文が内側の器で転がる）  | —                             |
| GitBook     | 1200 < 境 ≦ 1280         | 224px・右                                       | 14px   | sticky   | あり（色・太さ 600）              | 768 / 768                     |
| Mintlify    | 1200 < 境 ≦ 1280         | 236px・右                                       | 14px   | sticky   | あり（`aria-current="location"`） | 648 / 648                     |
| GitHub Docs | 1280 < 境 ≦ 1440         | 277px・右                                       | 14px   | sticky   | あり（太さ 600・`aria-current`）  | 740 / 785                     |

- **本文の幅は 1920 幅でも 648〜799px で止まる**（Docusaurus だけ 958 まで伸びる）。窓が狭まると**目次が先に消え、本文の幅は最後まで保たれる**:
  Mintlify は 1024〜1920 で 648px のまま、Linear は目次のある 1100 で 490px、目次が消えた 1024 で 696px
- 760 幅で目次を出し続けるのは MDN だけで、本文の頭に置き直す（NN/g の「本文の頭へ移す」[1]）
- いまの節の強調は字の色か太さを変えるだけで、地を塗るものは無かった。tsukumo の列は「地と左の印」で強調する

## 2. 知見: 形式の選択（1本・タブ・畳み・2段）

| 知見（数と条件）                                                                                                                                                                                                      | 出典 |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---- |
| タブを使うのは「長い中身にはっきりした群がある・群が少ない・重要さが不均等・短く名付けられる・**別のタブの中身を同時に見なくてよい**」とき。群が無ければ小見出し付きの1ページ。タブが溢れると隠れたタブは見つからない | [4]  |
| progressive disclosure は「2段を超えると迷う」。accordion は読み手が数か所だけ要るときに（既存メモ `report-structure-for-skimming-readers.md` の表）                                                                  | [5]  |
| fisheye（重要でない節を縮める＝既定で畳むのに近い）は速いが付随の記憶を落とす（1章の表）                                                                                                                              | [6]  |
| 画面と紙の読解の差のメタ分析（54研究・171,055人）: 紙が有利で g = −0.21。**時間に追われる読みで差が広がり**、情報の文で一貫、年を追って広がる                                                                         | [9]  |
| EC の商品ページの横のタブは、探している利用者にも見落とされる。デスクトップは「展開した節」、長いモバイルは「畳んだ節」を勧める（2018、2026-07 更新）。「27% が見落とした」は現行の頁に無く二次でのみ                 | [10] |
| 道具の学習で、上級の機能を塞いだ「補助輪」の画面は学習が速く理解の事後テストも良く、比べた群は時間の約4分の1を塞がれた誤りからの回復に使った（文書ではなく操作の実験）                                                | [11] |
| 構造化抄録（決まった欄の要約）の31研究: 21〜35% 長いが、**情報が多く・読みやすく・有用と判断される**。探す速さは簡略化した材料では速いが、MEDLINE の実物では利が出ていない。記憶の研究はほぼ無い                      | [12] |

**2段（判決の札＋証拠の引き出し）の先例**: GitHub の merge box は既存メモ `agent-report-ui-patterns.md` にある。新しく当たったもの:

| 製品                     | 上の段（すぐ読む）                                                                                              | 下の段（開く・別の口）                                           | 出典 |
| ------------------------ | --------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- | ---- |
| Buildkite の annotation  | build の頁の最上部。`--priority` 1〜10（既定 3、10 が先頭）で並ぶ                                               | job ごとのログ。`--append` で同じ注釈に足す                      | [27] |
| Linear の project update | 健全さの3値（On track・At risk・Off track）＋本文。**前回からの進み**（期日の変更・担当・里程標）を自動で添える | 過去の更新は Updates のタブに時系列                              | [26] |
| Vercel の deployment     | build の所要・検出した framework・ログと誤り                                                                    | 「Deployment Summary」の節を開くと成果物（関数・静的資産）の一覧 | [30] |
| Slack のスレッド         | チャンネルの本流                                                                                                | スレッドの返信。結論だけ「Also send to #channel」で本流へ        | [29] |

## 3. 知見: 参照の見せ方

| 知見（数と条件）                                                                                                                                                                                                                                                                                     | 出典 |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---- |
| Wikipedia の page previews（英独、2017-10〜2018-02 の2回）: セッションあたりの閲覧 **−3〜5%**、触れた異なるページ **+20〜22%**、戻るボタン **−2〜9%**、閲覧1回あたり見たプレビュー 0.26〜0.27、無効化 **約 0.01%**。カードはリンクに 500ms を超えて近づくと出し、1000ms 開いていたら「見た」と数える | [15] |
| 2016 の洪・伊・露の試験ではセッションの深さはほぼ変わらず（2.30→2.32、2.91→2.94、3.42→3.38）。「読むページを選ぶ精度が上がった」と解釈                                                                                                                                                               | [15] |
| 黒い字の中の色の付いた語は飛ばされにくい（色の語が複数あると消える）。Web の形の文で**見慣れない語のリンクは go-past 時間が 38ms 延び、文の読み返しが増える**。見慣れた語では差が無い（30・36・32人）                                                                                                | [16] |
| 余白の注は**周辺視の早い範囲にあるほど**目が移りやすく、本文と注の間の目の移りの数は、素早い読み返しでの理解と正に関係した（眼球運動、3群）                                                                                                                                                          | [17] |
| 本文に統合した AI の余白の注は、別の窓のチャットより好まれた。理解の差は出ず、手で選ぶほうが所有感が高い（CHI 2026）                                                                                                                                                                                 | [18] |
| 引用の型: 名前と年は「誰がいつ」を知りたい学術の読み手に、番号は読みやすさを優先する読み手に向く（Hartley 2004 の見解。原文は未読）【二次】                                                                                                                                                          | [19] |
| VS Code の端末は存在を確かめたファイルのパスを `file:1:2`・`file:line 1, column 2` などの形で拾い、Cmd/Ctrl+クリックで行まで開く。URL `vscode://file/<絶対パス>:line:column` はブラウザからも開ける                                                                                                  | [20] |
| Warp は `name:line`・`name:line:col`・`name[line, col]`・`name(line, col)`・`name, line: n, column: m` などを拾い、⌘+クリックで開き、普通のクリックでは「Open File」の札を出す。開くエディタは設定で選ぶ（VS Code・JetBrains・Zed・Cursor ほか）                                                     | [21] |
| OSC 8 は端末の字に URI を付ける。同じ `id` の字はホバーで一緒に下線が付く。`file://` はホスト名を照らし、違えば開かない。Ctrl+クリックや URI の表示を勧める                                                                                                                                          | [22] |
| Orca 1.4.227 の `orca file open <path> [--worktree] [--focus]` に行・桁の引数は無い【実測】                                                                                                                                                                                                          | [23] |

## 4. 知見: 中間と最終（積まれる更新と、確定した版）

| 先例                     | 進行中の並び                                                                 | 終わったあと                                                                                        | 最新・確定の置き場                                                      | 出典      |
| ------------------------ | ---------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- | --------- |
| Guardian のライブブログ  | **新しい順**（最新が上）。平均 360分・更新 40回・4,031語、約10分ごとに更新   | **CMS で時系列を反転できる**。読み手は進行中にも、終わってから「出来事の記録」としても読む          | 2022 年は「最も重要な最新の出来事を上に留める」「鍵の出来事だけに絞る」 | [24] [25] |
| Linear の project update | 更新を定期に積む                                                             | 過去は Updates のタブに時系列                                                                       | **最新の1件を概要の頁に出す**                                           | [26]      |
| Buildkite の annotation  | 同じ `--context` で出し直すと**置き換え**、`--append` で足す                 | —                                                                                                   | 優先度の順に頁の上へ                                                    | [27]      |
| GitHub の PR             | 会話は時系列。古い・解決したコメントは理由付きで畳める（Outdated・Resolved） | 見たファイルは「Viewed」で畳み、その後変わると「Changed since last view」の札。上に見た数と残りの数 | 題と状態は sticky の頭                                                  | [28]      |
| Slack のスレッド         | 返信は本流の外に積む                                                         | 結論だけ本流へ送る口                                                                                | チャンネルを開くと既定で「離れた所から」                                | [29]      |

- Guardian の調査（2011 年 3〜5 月の指標）では、ライブブログの訪問者の中央値は同じ話題の記事より **233%**、閲覧は **300%** 多かった。
  読み手の評価は即時性（49%）が最も高く、批判の1つは「情報の階層が無い」[24]
- 共通の型は、**進行中は最新を目立たせ、終わったら確定の版を入口に置き、経過は畳むか別の口に退ける**こと。上から時系列のまま
  確定の版を最後に置く先例は、GitHub の PR（merge box が下）だけだった

## 5. 知見: 伸びる文書を読む（ストリーミングと読む位置）

| 知見（数と条件）                                                                                                                                                                                                                                                              | 出典 |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---- |
| 流す速さの快適な上限（英語、200人と100人）: 99 パーセンタイルで**込み入った文 11.97 語/秒・易しい文 21.20 語/秒**（差は t(78)=11.81, p<.001）。読む速さを超えて流しても体験は良くならない（主張そのものは既存メモ `report-block-craft.md` の表にある）                        | [34] |
| CSS Scroll Anchoring: 優先の候補（編集中の入力・ページ内検索の当たり）の次に、DOM の順で最初に見えている要素を錨にし、その動きぶん転がりを補う。**転がりが先頭（0）のときは錨を選ばない**。寸法・位置・`transform` の変化の直後は補正を止める。`overflow-anchor: none` で外す | [35] |
| Chrome は 56 から既定で有効にし、「1 ページの閲覧あたり平均ほぼ3回の跳び」を防いでいた（2017-04）                                                                                                                                                                             | [36] |
| AI のチャット向けの `use-stick-to-bottom`: 伸びる中身の下端に張り付き、**利用者が上へ転がしたら張り付きを外す**（自分の動かした転がりと区別する）。寸法の変化は `ResizeObserver` で拾い、ばねの動きで追う                                                                     | [37] |

tsukumo の演出は既にこの型にある: 筆先を追う自動送りを持ち、ホイールや指で転がしたら追うのだけを降ろし（筆は止めない）、`scroll` の
イベントは聞かない（`src/browser/domain/reveal/use-report-reveal.ts` の冒頭）。見出しを先に出す・10秒で打ち切るは 10-17 に決まった。

## 6. 知見: 幅と窓の大きさへの応答

- **docs サイト**（1.1 の表）: 本文は 648〜799px で止め、狭くなったら右の目次を先に消し、次に左の案内を畳む【実測】
- **Distill**: 本文 `l-body`、少し広い `l-middle`、広い `l-page`、全幅 `l-screen`・`l-screen-inset`、それぞれ少しはみ出す `-outset`、本文の右に
  浮かせる `.side`、余白の注の `l-gutter`（「モバイル以外では本文の流れを切らない」）[38]。寸法は既存メモ `beautiful-explanation-design-precedents.md` 1.1
- **Quarto**: 格子の既定は sidebar 250px・body 800px・margin 250px・gutter 1.5em で、「表示の幅ではなく最大の基準値」。列の class は
  `column-body`・`-outset`・`column-page(-inset)`・`column-screen(-inset)`・`column-margin` と左右の片寄せ。`reference-location: margin` で脚注を、
  `citation-location: margin` で引用を余白へ出す。`page-layout: full` は余白に何も無ければ本文を余白まで広げる [39]
- **Typst** の図は `placement` が none（流れの中）・auto（近い方の上か下）・top・bottom、`scope` が column か parent（段をまたぐ）[40]
- **LaTeX** の浮動体は既定の位置指定 `tbp`、頁の上に置ける浮動体は頁の **70%**（`\topfraction`）まで、下は 30%、本文は最低 20%、浮動体だけの
  頁は 50% 以上（`\floatpagefraction`）、上に2つ・下に1つ・合計3つまで [41]

## 7. 知見: 読む時間の測り方

| 先例                         | 定義                                                                                                                                                                          | 出典 |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---- |
| Wikipedia の ReadingDepth    | `totalLength`（最初の描画から）と **`visibleLength`（描かれていて、タブが見えている間だけ）**。見えなくなると時計を止め、離れるときに `sendBeacon` で1件送る（2017〜2019-08） | [42] |
| Medium の Total Time Reading | 転がりの位置を定期に記録し、別のタブ・席を外した間を後処理で除いて合計する（2013）【二次】                                                                                    | [43] |
| Medium の read time          | 265 語/分＋画像1枚目 12秒から1秒ずつ減らし下限 3秒。中日韓は 500字/分【二次】                                                                                                 | [43] |
| Chartbeat の engaged time    | 転がす・マウスを動かす・キーを押すたびに「次の5秒は読んでいる」とみなす。タブを替えると止まる【二次】                                                                         | [44] |
| 作業時間の中心               | 時間は右に裾が長い。25人未満なら幾何平均が中央値より誤差 13%・偏り 23% 少ない                                                                                                 | [45] |

Wikipedia の時間を使った研究は、閲覧1回あたりの滞在が地域と端末で違うことを示した（OpenSym 2019）[42]。

## 8. tsukumo に効く示唆

印は効く先: 〔規約〕＝書き手への規約 / 〔塊〕＝report の欄 / 〔描画〕＝CSS・部品 / 〔仕組み〕＝検査・計測・運用。原則（札の中の並び・
局面の入れ替え・色の出る場所）に触れるものに**「正典の変更」**と付ける。採否は決めない。いまの寸法は 1440×900 でメインビューの読む面が
約 760×450px（帯の下はさらに狭い）。

### 8.1 いま／先例／差

| 項目                 | いま                                                                                                                       | 先例                                                                                                        | 差                                                         |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| 目次                 | 左のやり取りの列（札の 22%、128〜384px）。見ているやり取りの `##` `###` を子の行に、いまの節を地と印で示す。転がしても残る | sticky の列 181〜300px・scroll-spy（8つ中6つ）[46]。左の列は「とても一般的」[1]。概観＋詳細は理解で勝つ [6] | 先例の範囲。やり取りと見出しを1列に重ねたのは独自          |
| 狭い札の目次         | 札が 48rem 未満で列を畳み、開き直す口と知らせの印だけ                                                                      | 本文の頭へ移す・畳める sticky の目次 [1]、題を sticky に [28]、sticky scroll [32]                           | **居場所を言う口が無い**（「いま: <節の見出し>」は未採用） |
| 狭まり方             | 列を先に畳んで本文の行長を守る（2026-10-02 の決定）                                                                        | 目次を先に消し、本文の幅を最後まで保つ【実測】                                                              | 同じ順                                                     |
| 節を移るキー         | やり取りは `[` `]`、節は列にフォーカスして ↑↓ と Enter                                                                     | Vim の `[[` `]]`・`{` `}` [33]、見出しをたどる読み手 71.6% [13]                                             | 本文から節へ跳ぶキーが無い                                 |
| 読み返しの位置       | やり取りを移ると札の先頭へ（`useActiveTurnScroll`）                                                                        | Slack の既定は続きから [29]、見た場所の印 [14]                                                              | 戻ると位置を失う                                           |
| 中間と最終の並び     | 依頼 → 畳んだ中間（1行ずつ）→ 最終。閉じたら札の先頭から読ませる                                                           | 終わったら確定の版を入口に、経過は畳むか別の口 [24] [26] [27] [29]                                          | **最終が中間の下**。中間が多いほど最終の頭が下がる         |
| 前回から変わったもの | 無い                                                                                                                       | 「Changed since last view」[28]、前回からの進みの自動の要約 [26]                                            | 中間を読んだ人に差が分からない                             |
| 参照の確かめ         | git 管理下のパスは押すと Orca で開く。行番号は運ばない                                                                     | Wikipedia のプレビュー [15]、VS Code・Warp は行まで [20] [21]                                               | 開かずに確かめる口が無い。Orca に行の口が無い【実測】      |
| 図の高さ             | 塊の図に、読む面に対する高さの上限は無い（質問の preview の画像だけ 20rem）                                                | LaTeX は上の浮動体を頁の 70% まで [41]                                                                      | 読む面より高い図は題・前後の文と一緒に見えない             |
| 読む時間             | 測らない（10-17 の判断9）                                                                                                  | 見えている時間 [42]・操作から5秒 [44]                                                                       | —                                                          |

### 8.2 採るとしたら

**(a) 閉じたら最終レポートを入口に置く**〔描画〕**正典の変更**（`docs/architecture/display.md` 4.2「各表示物」の札の中の並び）

- 閉じた札の並びを「依頼 → **最終** → 経過 n 件（中間を1つの畳みにまとめる）」にする。経過の畳みの中は今の中間の `<summary>` の並び（時系列）のまま
- 働くあいだは今のまま（新しい中間が開き、追い越された中間は畳む）。並びが変わるのは閉じた瞬間だけなので「入れ替わるのは送ったときと閉じたときだけ」の約束の内側に収まる
- 根拠: Guardian は終わったら時系列を反転し、Linear は最新を概要に、Buildkite は優先度で上へ、Slack は結論だけ本流へ [24] [26] [27] [29]。
  走り読みは最初の1画面に時間の 57% を使う（既存メモの NN/g）ので、最終の頭が中間の畳みの下にあると判決の札が1画面目から落ちうる
- 小さい案: 並びは変えず、閉じたら「札の先頭」でなく「最終レポートの頭」へ送る（13.13「遷移」の送り先だけの変更）

**(b) 列を畳んだときの居場所**〔描画〕

- 列を畳んだ札（と 760px 以下の頭の2行）でだけ、進み具合の帯の1行目の右に「いま: <いちばん近い `##`>」を出す。新しい sticky の行は足さない
  （読む面が 450px しかなく、NN/g は sticky の頭を小さく保てと言う [3]）。13.13 で「まだ入れていない」とした案の、出す条件を絞った形
- 根拠: 概観が見えると評点と選好が上がる [6]、スクロールで位置を見失うと理解が落ちる [7]、GitHub・VS Code は題を上に留める [28] [32]

**(c) 節を移るキー**〔描画〕: メインビューにフォーカスがあるとき `{` `}` で前後の `##`（と `###`）の頭へ転がす。`[` `]`（やり取り）はそのまま。
Vim の段落の動きに合わせ [33]、見出しをたどる読み方 [13] に本文の側からも届かせる。JIS 配列と IME の変換中の届き方を目視で確かめる

**(d) 読み返しの位置を保つ**〔描画〕**正典の変更**（やり取りを移ると先頭へ戻す今の形）

- やり取りごとに最後の読み位置（見出しの番号と、その見出しからのずれの px）を会話の間だけ覚え、戻ったらそこへ転がす。覚えるのは数だけで本文は持たない
  （`docs/coding-standards.md`「会話内容の扱い」に触れない）。初めて開くやり取りと、閉じて最終に入れ替わった直後は今のまま先頭
- 列の見出しの行に「転がして通り過ぎた」薄い印を付ける（Footprints の見た場所の印 [14]、GitHub の Viewed [28]）。先に (a) と (b) を入れてから要否を見る

**(e) 前回から変わった節の印**〔描画〕: 中間を開いて読んだあと最終に入れ替わったとき、列の見出しの行のうち中間に無かった `##` に小さな印を付ける
（「Changed since last view」[28]、Linear の前回からの進み [26]）。見出しの字の一致だけで決め、本文は比べない。`display.md`「見せ方と再構成の線引き」の
内側かを先に確かめる

**(f) パスのプレビュー**〔描画〕〔仕組み〕

- `path:line` の押せる部品に、ホバーとフォーカスで前後3行を出す小さな窓を足す。出すのは 500ms 待ってから（[15] の値）、押すと今どおり Orca で開く。
  読むのは今の `openFile` と同じく git 管理下のファイルだけ。要点はプレビューにだけ置かない（既存メモの Tse・Victor）
- 根拠: プレビューで閲覧が減り触れる先が増え、無効化はほぼ0 [15]。行番号を Orca へ運ぶのは Orca に口ができてから（外部の道具を足さない）
- リンクの字を増やしすぎない: 色の付いた語は飛ばされにくく、見慣れない語では読み返しを生む [16]。押せる部品の印は今の控えめな形のまま

**(g) 図の高さの上限**〔描画〕: `graph`・`mermaid`・`image` の図を読む面の高さの約 70%（[41] の `\topfraction`）までに縮めて題と一緒に見せ、
全体は今の画像の拡大と同じ口で開く。読む面より高い図が何割あるかを先に数える（`report-block-usage.ts` に図の高さは無い）

**(h) 形式は1本のまま**: タブにしない（判決と証拠は同時に見比べる中身で、群も並列でない [4]）、節を既定で畳まない（fisheye は付随の記憶を落とす [6]、
GOV.UK と NN/g の畳む基準は既存メモ）。2段に分けてよいのは (a) の「経過」だけで、これは一部の読み手が時々要る中身にあたる。
判決の頭を決まった欄にしたこと（10-17）は構造化抄録の「情報が多く読みやすい」と同じ向き [12]

**(i) 演出のあいだの口**〔描画〕【推測】: 手で転がして自動送りを降ろしたあと、筆先が読む面の外にあるなら下端に「書いているところ ↓」の口を浮かべる
（`use-stick-to-bottom` の外し方 [37] と、tsukumo の「お伺い ↓」の口と同じ形）。書き上がったら消す

**(j) 測る**: 10-17 の判断9（時間の記録は採らない）は変えない。理由の「読む前に別の作業を挟む」は、先例では見えている時間 [42] と操作からの5秒 [44] で
除いている。将来見直すときの定義の候補として記録だけ残す

### 8.3 急がないもの

| 案                      | 理由                                                                                          |
| ----------------------- | --------------------------------------------------------------------------------------------- |
| 読む進みの棒            | 効果の実験が見つからない。帯・列・スクロールバーと役が重なる                                  |
| 目次を右の列へ移す      | 左の列は先例の範囲で、右は right-rail blindness を受けやすい [1]。右は余白の柱が使う          |
| 引用を番号に揃える      | 名前か番号かは読み手の目的次第 [19]。出典を持つのは調べものの報告だけで、使われ方を先に数える |
| sticky の節の見出しの行 | 読む面の高さが足りない。(b) で帯に畳む                                                        |

## 確かめていないこと

- Notion の頁の幅と浮かぶ目次は測れなかった（公開の頁が headless で描かれなかった）。Stripe docs のいまの節の強調は、本文が内側の器で転がり
  窓の転がしでは測れなかった。Linear docs は3点で強調が替わらず、無いのか測り方の漏れかは分からない
- Sanchez & Wiley [7] と Piolat [8] は要旨だけで本文と効果量を読んでいない。Hornbæk [6] は欧文の学術文書・20人・1時間45分の条件で、文脈を持つ1人の作者が
  自分の依頼の報告を読む場面とは違う
- Baymard の「27%」、Medium の read time と TTR、Chartbeat の定義、Hartley の引用の型、VS Code の sticky scroll の行数の既定は二次でしか照合できなかった
- 1依頼あたりの中間レポートの件数の分布を数えていない。(a) の効き目の大きさ（最終の頭が1画面目から落ちる割合）はこれで決まる
- Scroll Anchoring が sticky の帯と手順の一覧の開け閉め、追い越された中間の畳みでどう効くかを、Orca の Chromium で確かめていない
  （帯が錨に選ばれると補正が効かない形になりうる【推測】）
- 読む面より高い図の割合、`{` `}` が JIS 配列と IME の変換中にどう届くか
- 研究はすべて欧文の読み手で、和文の長い報告を暗い面で読む条件の実験は見つからなかった

## 出典一覧

1. NN/g, Wang & Brown「Table of Contents: The Ultimate Design Guide」（2023-10-06）https://www.nngroup.com/articles/table-of-contents/
2. NN/g, Schade「In-Page Links for Content Navigation」（2017-05-07）https://www.nngroup.com/articles/in-page-links/
3. NN/g, Laubheimer「Sticky Headers: 5 Ways to Make Them Better」（2021-04-04）https://www.nngroup.com/articles/sticky-headers/
4. NN/g, Sunwall「Tabs, Used Right」（2024-08-02）https://www.nngroup.com/articles/tabs-used-right/
5. Nielsen「Progressive Disclosure」（2006-12-03）https://www.nngroup.com/articles/progressive-disclosure/
6. Hornbæk & Frøkjær「Reading of Electronic Documents: The Usability of Linear, Fisheye, and Overview+Detail Interfaces」CHI 2001, DOI 10.1145/365024.365118（本文 https://hjemmesider.diku.dk/~kash/papers/CHI2001_hornbaek.pdf ）
7. Sanchez & Wiley「To Scroll or Not to Scroll: Scrolling, Working Memory Capacity, and Comprehending Complex Texts」Human Factors 51(5):730–738, 2009, DOI 10.1177/0018720809352788（PMID 20196297 の要旨）
8. Piolat, Roussey & Thunin「Effects of screen presentation on text reading and revising」IJHCS 47(4):565–589, 1997, DOI 10.1006/ijhc.1997.0145（要旨は二次の要約で照合）
9. Delgado, Vargas, Ackerman & Salmerón「Don't throw away your printed books: A meta-analysis on the effects of reading media on reading comprehension」Educational Research Review 25:23–38, 2018, DOI 10.1016/j.edurev.2018.09.003（数は検索結果の要約で照合）
10. Baymard Institute「Avoid Horizontal Tabs」（2018-10-17、2026-07-08 更新）https://baymard.com/blog/avoid-horizontal-tabs
11. Carroll & Carrithers「Training Wheels in a User Interface」CACM 27(8):800–806, 1984, DOI 10.1145/358198.358218
12. Hartley「Current findings from research on structured abstracts」J Med Libr Assoc 92(3):368–371, 2004, https://pmc.ncbi.nlm.nih.gov/articles/PMC442180
13. WebAIM「Screen Reader User Survey #10 Results」（2024）https://webaim.org/projects/screenreadersurvey10/
14. Alexander, Cockburn, Fitchett, Gutwin & Greenberg「Revisiting read wear: analysis, design, and evaluation of a footprints scrollbar」CHI 2009, DOI 10.1145/1518701.1518957（要旨 https://eprints.lancs.ac.uk/id/eprint/50114/ ）
15. Wikimedia「Page Previews/2017-18 A/B Tests」https://www.mediawiki.org/wiki/Page_Previews/2017-18_A/B_Tests ・「Page Previews/2016 A/B Tests」https://www.mediawiki.org/wiki/Page_Previews/2016_A/B_Tests
16. Fitzsimmons, Weal & Drieghe「The impact of hyperlinks on reading text」PLOS ONE 14(2):e0210900, 2019, DOI 10.1371/journal.pone.0210900
17. Mazzei, Koll, Kaplan & Dillenbourg「Attentional processes in natural reading: the effect of margin annotations on reading behaviour and comprehension」ETRA 2014, DOI 10.1145/2578153.2578195
18. Joshi & Vogel「Designing and Evaluating AI Margin Notes in Document Reader Software」CHI 2026, arXiv:2509.09840 https://arxiv.org/abs/2509.09840
19. Hartley「Two ways for organizing references」中国科技期刊研究 15(2):127, 2004 https://www.cjstp.cn/EN/Y2004/V15/I2/127 【二次】
20. VS Code「Terminal Basics」の Links https://code.visualstudio.com/docs/terminal/basics ・「Command Line Interface」の Opening VS Code with URLs https://code.visualstudio.com/docs/configure/command-line
21. Warp「Files, Links, & Scripts」https://docs.warp.dev/terminal/more-features/files-and-links
22. Egmont Koblinger「Hyperlinks (a.k.a. HTML-like anchors) in terminal emulators」https://gist.github.com/egmontkob/eb114294efbcd5adb1944c9f3cb5feda
23. Orca CLI 1.4.227 の `orca file open --help`（2026-10-18 に手元で打った）【実測】
24. Thurman & Walters「Live Blogging — Digital Journalism's Pivotal Platform?」Digital Journalism 1(1), 2013, DOI 10.1080/21670811.2012.714935（著者原稿 https://openaccess.city.ac.uk/id/eprint/1742/ ）
25. Reuters Institute「Tips on live blogging … from the Guardian」（Chris Moran、2022-02-28）https://reutersinstitute.politics.ox.ac.uk/news/tips-guardian-live-blogging-and-covering-breaking-news-ukraine
26. Linear Docs「Initiative and project updates」https://linear.app/docs/initiative-and-project-updates
27. Buildkite「buildkite-agent annotate」https://buildkite.com/docs/agent/cli/reference/annotate
28. GitHub Changelog「Sticky conversation headers」（2019-01-04）https://github.blog/changelog/2019-01-03-sticky-coversation-headers ・「Mark files as viewed」（2019-07-01）https://github.blog/news-insights/product-news/mark-files-as-viewed/ ・Docs「Managing disruptive comments」https://docs.github.com/en/communities/moderating-comments-and-conversations/managing-disruptive-comments
29. Slack Help「Use threads to organize discussions」https://slack.com/help/articles/115000769927 ・「Manage your Mark as read preference」https://slack.com/intl/en-gb/help/articles/360043037853
30. Vercel Docs「Deploying to Vercel」の Resources Tab and Deployment Summary https://vercel.com/docs/deployments
31. Notion「Releases 2.40」（2024-06-11）https://www.notion.com/releases/2024-06-11
32. VS Code「July 2022 (version 1.70)」の Sticky Scroll https://code.visualstudio.com/updates/v1_70 （行数の既定は二次）
33. Vim「motion.txt」の `]]`・`[[`・`{`・`}` https://vimhelp.org/motion.txt.html
34. 「Streaming, Fast and Slow: Cognitive Load-Aware Streaming for Efficient LLM Serving」UIST 2025, DOI 10.1145/3746059.3747721（arXiv:2504.17999v2 https://arxiv.org/html/2504.17999v2 ）
35. W3C「CSS Scroll Anchoring Module Level 1」Editor's Draft 2026-09-30 https://drafts.csswg.org/css-scroll-anchoring/ ・MDN「overflow-anchor」https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/overflow-anchor
36. Google「Taking aim at annoying page jumps in Chrome」（Steve Kobes、2017-04-11）https://blog.google/products-and-platforms/products/chrome/taking-aim-annoying-page-jumps-chrome/
37. StackBlitz Labs「use-stick-to-bottom」README https://github.com/stackblitz-labs/use-stick-to-bottom
38. Distill「Distill Guide」の Layouts https://distill.pub/guide/
39. Quarto「Article Layout」https://quarto.org/docs/authoring/article-layout.html ・「Page Layout」の Grid Customization https://quarto.org/docs/output-formats/page-layout.html
40. Typst「figure」の `placement`・`scope` https://typst.app/docs/reference/model/figure/
41. 「LaTeX2e unofficial reference manual」Floats https://latexref.xyz/Floats.html
42. Wikimedia「Research:Reading time」https://meta.wikimedia.org/wiki/Research:Reading_time ・TeBlunthuis, Bayer & Vasileva「Dwelling on Wikipedia: Investigating Time Spent by Global Encyclopedia Readers」OpenSym 2019, DOI 10.1145/3306446.3340829 ・ReadingDepth の欄の定義 https://phabricator.wikimedia.org/T155639 （欄の定義は検索結果の要約で照合）
43. Medium Data Lab「Medium's metric that matters: Total Time Reading」（2013-11-21）https://medium.com/data-lab/mediums-metric-that-matters-total-time-reading-86c4970837d5 ・Medium Help「Read time」https://help.medium.com/hc/en-us/articles/214991667-Read-time （どちらも 403。検索結果の要約で照合）【二次】
44. Chartbeat Help「Engagement Tracking」https://help.chartbeat.com/hc/en-us/articles/360045890913 （403。検索結果の要約で照合）【二次】
45. Sauro & Lewis「Average task times in usability tests: what to report?」CHI 2010, DOI 10.1145/1753326.1753679（要約 https://measuringu.com/average-times/ ）
46. 【実測】の頁: https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/details ・https://quarto.org/docs/authoring/article-layout.html ・https://docusaurus.io/docs/api/docusaurus-config ・https://linear.app/docs/initiative-and-project-updates ・https://docs.stripe.com/payments/accept-a-payment ・https://gitbook.com/docs/creating-content/formatting/markdown ・https://www.mintlify.com/docs/organize/navigation ・https://docs.github.com/en/get-started/writing-on-github/getting-started-with-writing-and-formatting-on-github/basic-writing-and-formatting-syntax

tsukumo のいまの形は `docs/architecture/screen-design.md` 13.4・13.13、`docs/architecture/display.md` 4.2「各表示物」、
`src/browser/components/page/conversation/components/main-view/hooks/use-active-turn-scroll.ts`、`src/browser/domain/reveal/use-report-reveal.ts`
（2026-10-18 の作業ツリー）で読んだ。
