---
name: list-tasks
description: "develop/tasks.json に登録されているタスクの一覧を、テーブル形式の要約だけで表示する。ユーザーが「タスク一覧を見せて」「今どのタスクが残ってる？」「tasks.json の中身を教えて」と言ったときに使う。読み取り専用で、タスクの実行も登録もしない。"
---

`develop/tasks.json` の中身を**テーブル1つに要約して表示するだけ**のスキル。

**何も書き換えない。タスクを実行しない。** 実行は `/next-task`、登録は `/plan-tasks`。
このスキルは「今どうなっているか」を1画面で見るためだけにある。

## タスク本文を読み込まない

1タスクの `task` 本文は3KB前後あり、全件読むとそれだけでコンテキストを大きく消費する。
一行要約は `summary` フィールドに入っているので、**下のコマンドの出力だけを使う**。
`develop/tasks.json` を Read ツールで開いたり `cat` したりしない。

```bash
python3 - <<'EOS'
import json, os
p = "develop/tasks.json"
ts = json.load(open(p))
if not ts:
    print("EMPTY")
    raise SystemExit
done_ids = {t["id"] for t in ts if t["status"] == "done"}
ids = {t["id"] for t in ts}
for t in ts:
    blocked = [d for d in t["dependencies"] if d in ids and d not in done_ids]
    if t["status"] != "todo":
        ready = "-"
    elif blocked:
        ready = "BLOCKED:" + ",".join(blocked)
    else:
        ready = "READY"
    print("\t".join([
        t["id"], t["status"], t["difficulty"],
        ",".join(t["dependencies"]) or "-", ready,
        "yes" if t["passes"] else "no",
        t.get("summary", "(summaryなし)").replace("\t", " "),
    ]))
d = [t for t in ts if t["status"] == "done"]
print("---")
print("counts\t" + "\t".join(f"{s}={sum(1 for t in ts if t['status'] == s)}" for s in ("todo", "doing", "done")))
print(f"done_size\t{len(json.dumps(d, ensure_ascii=False))}\tfile_size\t{os.path.getsize(p)}")
EOS
```

出力は TSV。列は
`id / status / difficulty / dependencies / 着手可否 / passes / summary`。

## 表示のしかた

1. 上のコマンドを実行する。`EMPTY` が返ったら「登録されているタスクは0件」と伝えて終わる。
2. 次の形のテーブル**1つだけ**を出す。行の並びは `todo`（着手可能なものが先）→ `doing` → `done`。

   | ID | 状態 | 難易度 | 依存 | 内容 |
   | --- | --- | --- | --- | --- |

   - **`内容` 列は `summary` をそのまま使う。** 要約し直さない（`summary` が既に一行要約で、
     書き方の正典は `docs/workflow.md`「summary」）。`(summaryなし)` が出たタスクは
     そのまま `(summaryなし)` と表示し、テーブルの下の1行で
     「`summary` フィールドの追加より前に登録されたタスク」と添える
   - `状態` は着手可否を織り込む。`todo` かつ `READY` は `todo（着手可）`、
     `BLOCKED:T-xxx` は `todo（T-xxx待ち）` と書く
   - `passes` が `no` のまま `done` のタスクは、状態を `done（未達で終了）` と書く。
     このリポジトリでは「着手しない判断」をこの形で閉じる運用があるため、
     成功した `done` と混ぜない
3. テーブルの下に**1行だけ**添える。件数（`todo`/`doing`/`done`）と、
   `done` が10件以上または `done_size` が30KB超ならアーカイブのトリガーに該当することを書く
   （基準は `docs/workflow.md`「いつ移すか（トリガー）」。**判定を書くだけで、移す作業はしない**）。

## 出さないもの

- タスク本文（`## 背景`・`## やること` などの中身）。**要約だけ**が仕事
- `evidence` の内容。`done` の詳細を見たいときは `docs/history/tasks-archive.md`
- `develop/progress.md` の内容。あれは別のファイルで、このスキルは触らない
- 「次はこれをやりましょう」の提案。聞かれたら答えてよいが、一覧に混ぜない

特定のタスクの本文を読みたいと言われたら、このスキルの範囲外。
`python3 -c "import json; print([t for t in json.load(open('develop/tasks.json')) if t['id']=='T-XXX'][0]['task'])"`
でその1件だけを読む。
