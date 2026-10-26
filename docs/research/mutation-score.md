# mutation score（`src/shared/`）

ステータス: **記録**（月 1 回、手元で回して追記する）。

責務: `src/shared/` の mutation score と、生き残った変異の上位を回ごとに残す。
読む時: 単体テストが実際に何を殺せているかを知りたいとき、月 1 の回を追記するとき。
直す時: 回すたびに末尾へ追記する。

## 回し方

```bash
TZ=UTC pnpm exec stryker run
```

- 設定は `stryker.config.mjs`。対象は `src/shared/**/*.ts`、増分の控えと JSON の報告は `~/.cache/tsukumo-stryker/`（リポジトリの外。作業ツリーの中だと文書の検査が JSON を読んで落ちる。`/tmp` は macOS が起動のたびに空にするので使わない）。
- `check` と CI には入れない。閾値は置かない（`break: null`）。
- `inPlace: true` で作業ツリーを書き換えながら走り、終われば元へ戻す。走っている間は編集しない。途中で止めるときは SIGINT（`kill -INT`）で、控えから元へ戻る。
- `TZ=UTC` が要る（`vitest.config.ts` の `env.TZ` は子プロセスの日付に効かないテストがある）。
- 複製先の作業場所では git の履歴が無く `listRepositoryFiles` のテストが落ちるため `inPlace` にしている。TypeScript 7 には Stryker 10.1.1 が呼ぶ `parseConfigFileTextToJson` が無く、複製先の方式も tsconfig の書き換えで落ちる。
- `ignoreStatic: true`。`ignoreStatic` なしの回で Stryker が「静的な変異 2,436 件が全体の時間の 99%」と見積もって警告したため付けた。付けた回で実際に Ignored になったのは 139 件で、2,436 件とは一致しない（2,436 は警告の見積もりで、除外した数ではない）。
- 所要: 約 41 分（concurrency 4。dry run 1 分 48 秒を含む）。

## 2026-10-27 1 回目

対象 174 ファイル、変異 10,748 件。単体テスト 4,767 件（dry run の件数）。控えを消した 1 回の通しの実行で、中断した回の結果は混ざっていない。

| 区分                  |  件数 |
| --------------------- | ----: |
| Killed                | 7,917 |
| Timeout（殺した扱い） |    15 |
| Survived              | 2,483 |
| NoCoverage            |   194 |
| Ignored（静的な変異） |   139 |

- mutation score: **74.77%**（全体）。テストが届いた変異に限ると 76.16%。
- 生き残りの変異の種類は、StringLiteral 577・ConditionalExpression 483・Regex 236・ObjectLiteral 221・MethodExpression 188 の順。

### 生き残りが多いファイル（上位 10）

「変異」は生き残った件数。例は先頭の 1 件（行と変異後）。

| #   | ファイル                                    | 変異 | 多い種類                                        | 例                                                            |
| --- | ------------------------------------------- | ---: | ----------------------------------------------- | ------------------------------------------------------------- |
| 1   | `src/shared/report/graph-fold-layout.ts`    |  236 | ArithmeticOperator 61・ConditionalExpression 59 | L42 `Math.ceil(main.length / perRow)` の `/` を `*` に        |
| 2   | `src/shared/report/report-block-diagram.ts` |  106 | StringLiteral 78・ArrayDeclaration 10           | L20 `z.object({ tone, label })` を `{}` に                    |
| 3   | `src/shared/report/graph-fold-frame.ts`     |  104 | ConditionalExpression 26・ArithmeticOperator 19 | L27 `slots.get(at)?.row ?? …` の `??` を `&&` に              |
| 4   | `src/shared/report/timeline-scale.ts`       |   81 | Regex 36・ConditionalExpression 20              | L74 `[read.kind]` を `["Stryker was here"]` に                |
| 5   | `src/shared/report/graph-fold-html.ts`      |   80 | ArithmeticOperator 24・StringLiteral 22         | L24 マーカー定義の SVG 文字列を空に                           |
| 6   | `src/shared/report/graph-source.ts`         |   78 | ConditionalExpression 22・StringLiteral 19      | L107 `nodes[found]?.change ?? "unchanged"` の `??` を `&&` に |
| 7   | `src/shared/report/report-tidy.ts`          |   77 | StringLiteral 21・Regex 17                      | L34 `sectionIndex === 0 && blockIndex === 0` を `true` に     |
| 8   | `src/shared/session/session-event-kind.ts`  |   74 | BooleanLiteral 72                               | L6 `SESSION_EVENT_KINDS` の値の真偽を反転                     |
| 9   | `src/shared/report/timeline-markdown.ts`    |   72 | ConditionalExpression 21・StringLiteral 19      | L42 `values === undefined` を `false` に                      |
| 10  | `src/shared/report/graph-fold.ts`           |   68 | ConditionalExpression 19・ArithmeticOperator 13 | L51 候補の `Array.from({ length: … })` の中身を差し替え       |

### 読み取り

- 上位 10 ファイルのうち 8 本が `src/shared/report/`（図と時間軸の組み立て）。レイアウトの算術・条件は、出力の形を細かく固定するテストが少ない。
- `report-block-diagram.ts`・`report-tidy.ts` の StringLiteral や Regex は、文字列そのものを検証するテストが無いか、出力が緩い比較で通っている。
- `session-event-kind.ts` の BooleanLiteral 72 件は、種類の表の値を 1 件ずつ検証する it が無いことを示す。表なので、表を読んで振る舞いを確かめる it を 1 本足すだけで多くを殺せる見込み。
- 閾値は置かないので、この数字で `check` は落ちない。次回以降は同じ表の件数の増減で見る。
