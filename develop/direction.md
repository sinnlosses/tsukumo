# 未対応の指示メモ（ここに書くと次のセッションが `/plan-tasks` でタスク化する。正典: `task-workflow` の `WORKFLOW.md`）

## 層をディレクトリで表す（T-080 の決定を実装に落とす。3段階）

正典: `docs/architecture.md`「層をディレクトリで表し、依存の向きをテストで縛る」と
`docs/coding-standards.md`「層と依存の向き」。**決めることはもう無い。上の正典どおりに動かすだけ。**

### 段階1: 移動と検査（ロジックを動かさない）

- `git mv` で `src/` を4層に割る。`domain` = `character.ts` / `expression.ts` / `utterance.ts` /
  `question.ts` / `pending-answer.ts` / `session-event.ts` / `task-summary.ts`（`tasks.ts` から改名）、
  `usecase` = `session-view.ts`、`presentation` = `view.ts` / `report-html.ts` /
  `report-notation.ts` / `browser/`、`infrastructure` = `session-driver.ts` / `view-server.ts` /
  `host.ts` / `orca-host.ts` / `view-port.ts` / `bundled-path.ts`（`bundled-files.ts` から改名）
- `test/` も同じ構成に移す（`src/<相対パス>.ts` → `test/<相対パス>.test.ts` の対応は維持）
- `test/architecture.test.ts` を足し、`src/` の import を読んで**許した辺以外を落とす**
  （`node:fs` と正規表現で足りる。外部ツールを増やさない）
- `docs/architecture.md` の「拾う/捨てる/足す」の表と責務の表に出てくる `src/*.ts` のパスを
  新しいものに直す。**節の数は変えない**
- ロジックは1行も変えない。`bun run check` が通ることと、実機で1往復できることで受け入れる

### 段階2: `index.ts` からユースケースを抜く

- 598行のうち `createEventSink` / `createViewPublisher` / `sidebarData` /
  `workingRefreshDelayMs` / `throttle` を `usecase` へ移し、`index.ts` は配線だけにする
- ファイルI/O（`readCharacterDefinition` / `readCharacterAssets` / `readOptionalFile` /
  `readOptionalMtimeMs`）と環境変数の読み取りは `infrastructure` へ
- **ここは中身が動く。** 移す前に、移す対象の振る舞いを押さえるテストがあるかを確かめる

### 段階3: `presentation` の中を割る

- **T-084（ブラウザ側 JS を `.ts` へ）と T-085（CSS を `.css` へ）の後に着手する。**
  `view.ts` 3277行から1000行以上が外へ出てから割らないと、割る線が二度動く
- 割り方（レイアウト / 領域ごと / レポート）は着手時に決める
