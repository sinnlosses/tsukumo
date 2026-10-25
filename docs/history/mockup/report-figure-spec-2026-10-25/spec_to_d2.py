# 試作: 図の構造化記述（spec-*.md）を、決まった配色の D2 へ機械的に写す。ADR 0034 の測定の表の「記述を機械的に D2 へ写す（tsukumo が描く案の試作）」の行。
# 使い方: python3 spec_to_d2.py spec-m1-structure.md > /tmp/fig-b-m1.d2 && d2 /tmp/fig-b-m1.d2 /tmp/fig-b-m1.png
import re
import sys

INK, DIM, LINE, PANEL, BG = "#e4ecee", "#8fa3ab", "#2e3b42", "#192227", "#11181c"
FIRE, NG = "#4fd1b8", "#e8707a"


def sections(text):
    current, out = None, {}
    for raw in text.splitlines():
        head = re.match(r"^(\S[^:]*):\s*(.*)$", raw)
        if head and not raw.startswith("- "):
            current = head.group(1)
            out[current] = [head.group(2)] if head.group(2) and head.group(2) != "なし" else []
        elif raw.startswith("- ") and current:
            out[current].append(raw[2:].strip())
    return out


def q(name):
    return '"' + name.replace('"', '\\"') + '"'


def main(src):
    s = sections(open(src, encoding="utf-8").read())
    direction = {"LR": "right", "TD": "down"}.get((s.get("向き") or ["LR"])[0], "right")
    groups = {}
    for line in s.get("群", []):
        name, members = line.split(":", 1)
        for m in members.split(","):
            groups[m.strip()] = name.strip()
    desc = {}
    for line in s.get("節点", []):
        name, _, d = line.partition("|")
        desc[name.strip()] = d.strip()
    emphasis = " ".join(s.get("強調", []))

    def path(name):
        g = groups.get(name)
        return f"{q(g)}.{q(name)}" if g else q(name)

    out = [
        "vars: { d2-config: { theme-id: 200; layout-engine: elk; pad: 24 } }",
        f"direction: {direction}",
        f'style: {{ fill: "{BG}" }}',
        "classes: {",
        f'  node: {{ style: {{ fill: "{PANEL}"; stroke: "{LINE}"; font-color: "{INK}"; border-radius: 8; font-size: 15 }} }}',
        f'  key: {{ style: {{ fill: "{PANEL}"; stroke: "{FIRE}"; stroke-width: 3; font-color: "{INK}"; border-radius: 8; font-size: 15; bold: true }} }}',
        f'  group: {{ style: {{ fill: "{BG}"; stroke: "{LINE}"; stroke-dash: 3; font-color: "{DIM}"; font-size: 14; border-radius: 10 }} }}',
        "}",
    ]
    for g in dict.fromkeys(groups.values()):
        out.append(f"{q(g)}.class: group")
    names = list(dict.fromkeys(list(desc) + list(groups)))
    for name in names:
        label = name + (f"\\n{desc[name]}" if desc.get(name) else "")
        cls = "key" if name in emphasis else "node"
        out.append(f'{path(name)}: "{label}" {{ class: {cls} }}')
    for line in s.get("関係", []):
        m = re.match(r"^(.+?)\s+(-\.?>)\s+(.+?)(?::\s*(.*?))?(\s*\[戻り\])?$", line)
        if not m:
            continue
        a, arrow, b, label, back = m.groups()
        for n in (a, b):
            if n not in names:
                names.append(n)
                out.append(f'{path(n)}: "{n}" {{ class: node }}')
        style = [f'stroke: "{NG if back else (DIM if arrow == "-.>" else FIRE)}"', 'font-color: "' + DIM + '"']
        if back or arrow == "-.>":
            style.append("stroke-dash: 4")
        if back and "戻り" in emphasis:
            style.append("stroke-width: 2")
        text = f": {q(label)}" if label else ""
        out.append(f"{path(a)} -> {path(b)}{text} {{ style: {{ {'; '.join(style)} }} }}")
    sys.stdout.write("\n".join(out) + "\n")


main(sys.argv[1])
