# docs/history/ の読み方

凍結した記録の置き場。正典ではなく、通常は読まない。理由や経緯を確かめたいときだけ引く。

| 置き場 | 役目 |
| --- | --- |
| `decision.md` | 設計判断のアーカイブ。凍結して残す。正典が指す理由の出典 |
| `mockup/` | 日付つきの画面の見本（HTML・PNG）。値の正典は `theme.css` のトークンと `docs/architecture/screen-design/` |
| `research/` | 調べ物の凍結した記録 |
| `architecture-placement.md` | 置き場所の名前を揃える提案の経緯 |
| `environment-2026-09-09.md` | 2026-09-09 時点の環境の実測値 |
| `retrospect.md` | 横断の振り返りの記録 |
| `maintenance/` | 文書メンテナンスの日付つきの記録 |

## 作業ツリーから外したもの

完了タスクの一覧 `tasks.md` と進行記録 `progress.md` は、作業ツリーから外した。ローカルのタグ `history/2026-10-26` から読める（タグは push していない）。

```bash
git show history/2026-10-26:docs/history/<ファイル名>
```

`<ファイル名>` は `tasks.md` か `progress.md`。

完了タスクの原文は Beads（`tw show <ID>`）と git log が持つ。
