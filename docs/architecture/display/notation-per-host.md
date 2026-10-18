# レポートの記法は、TUI と tsukumo で出し分ける

戻り: `docs/architecture/display.md`「レポートの記法は、TUI と tsukumo で出し分ける」

**出力スタイル（`~/.claude/output-styles/asuna.md`）は `~/.claude/settings.json` の
`outputStyle` で全プロジェクトに同じものが当たる**ため、そこに HTML の記法を書くと、tsukumo 以外の
素の TUI でもタグが文字のまま見える。

**tsukumo が `systemPrompt` の append で差分を足す形にする**（2026-09-12 決定）。

- グローバルの `asuna.md` は **TUI 向け**に保つ。人格・`speak` の分岐・セリフと詳細の書き分けは
  残し、**HTML の記法（`note` / `badge` / `cols` / `card` / `details` / `blockquote` / `hr`）と
  mermaid / chart のフェンスを外す**
- **レポートの文体は tsukumo が決める**（2026-09-14 決定）。**本文は中立の技術文**にし、
  キャラクターの口調を担うのは `speak` のセリフのほうにする。どのパックに切り替えても
  本文の読みやすさが変わらないようにするため（**長く読み続ける面**なので、読みやすさを
  キャラクター性より優先する）。書く場所は `src/server/report/core/report-notation.ts` で、
  **`persona.md` の側には書かない**
- **レポートは必ず日本語で書かせる**（2026-09-23 決定）。`CLAUDE.md` の「対話言語」だけでは
  本文が英語で出たことがあるため、同じ `report-notation.ts` の文面で縛り、検査（`non-japanese`）でも差し戻す。
  英語のまま残してよいのは識別子・パス・コマンド・コード・エラー文・原文の引用だけ
- **HTML・mermaid・chart の規約は tsukumo が持つ。** `query()` の
  `systemPrompt: { type: "preset", preset: "claude_code", append }` で足す。正典がリポジトリ内に
  来るので、**描ける記法の一覧が `src/browser/components/page/conversation/components/markdown/renderer/sanitize-schema.ts` と同じコミットで動く**
  （レンダラを直したのに規約が古いまま、が起きない）
- **`~/.claude/settings.json` には触らない**（`outputStyle` も、orca が専有する hooks /
  statusLine も無傷のまま）。書き換えるのは `asuna.md` 1ファイルだけ
- **毎ターン載る規約の節に何を残すか**（2026-10-05 決定）: 仕事の append の4節（セリフの間合い・
  ワークプラン・レポートの記法・質問の書き方）と、`report` / `work_plan` の引数・塊の `describe` は同じターンに
  そろって載る。**同じ条は1か所にだけ置き**（欄の書き方は引数の説明、ターンの終わり方と締めは記法の節、
  段を進めるときのセリフとの並べ方と委譲中の `n/N` はワークプランの節）、**差し戻しの文が直し方まで言う条は
  文面から外す**（`fold` の入れ子・候補の数・見出しの欠け・逃げ道に書いた塊の記法・段の飛ばし・段のまとめの欠け）。
  ただし最初の1回で外しやすい条（`conclusion` の長さ・地の文の段落の長さ）、差し戻しのたびに1往復が要る条
  （新しい事実の無いターンは `report` を呼ばない）は残す。文面の正典は各定数で、
  ここには写さない。削った前後で差し戻しが増えていないかは、変更の前後の同じ日数の transcript で
  メインの `report` / `work_plan` の呼び出しと差し戻しの数を、差し戻しの1行目の種類ごとに数えて比べる
  （数え方は `docs/history/decision.md`「display.md 4.2 レポートの記法（ツールの定義の字数の推移と切り替えの
  前の差し戻しの集計）」と同じ）

**この2つの案は採らない**（理由は `docs/history/decision.md`「requirements.md 4.2 表示 /
レポートの記法は、TUI と tsukumo で出し分ける」）: 出力スタイルを2ファイルに分けて選ぶ案と、
1ファイルのまま条件分岐で書く案。

**文面は `src/server/report/core/report-notation.ts` の `REPORT_NOTATION_PROMPT` にあり、
`startSdkDriver`（`src/server/session-driver/adapter/sdk-driver.ts`）が `query()` の `systemPrompt` へ渡す。**
