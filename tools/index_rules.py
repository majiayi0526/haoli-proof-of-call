#!/usr/bin/env python3
"""为 FIE 规则 PDF 建立「条款号 → 页码」索引。

目的很直接：界面上引用一条规则时，要能一键跳到官方 PDF 的那一页，
而不是丢给使用者一个 60 页的文件让他自己找。
「信源可核对」如果需要人翻五分钟，那它在场边就等于不可核对。
"""

from __future__ import annotations

import json
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
RULES_DIR = ROOT / "public/rules"

# 行首出现的条款号。技术规则用 t.xx，器材规则用 m.xx，组织规则用 o.xx
ARTICLE = re.compile(r"^\s{0,8}([tmo]\.\d{1,3})\s*$", re.MULTILINE)


def page_count(pdf: Path) -> int:
    r = subprocess.run(["pdfinfo", str(pdf)], capture_output=True, text=True)
    for line in r.stdout.splitlines():
        if line.startswith("Pages:"):
            return int(line.split()[1])
    return 0


def build_index(pdf: Path) -> dict[str, int]:
    """逐页扫描，记录每个条款号首次出现的页码（PDF 页码，从 1 起）。"""
    total = page_count(pdf)
    index: dict[str, int] = {}
    for page in range(1, total + 1):
        r = subprocess.run(
            ["pdftotext", "-layout", "-f", str(page), "-l", str(page), str(pdf), "-"],
            capture_output=True, text=True)
        for m in ARTICLE.finditer(r.stdout):
            art = m.group(1)
            index.setdefault(art, page)
    return index


def main() -> None:
    out = {}
    for pdf in sorted(RULES_DIR.glob("*.pdf")):
        idx = build_index(pdf)
        out[pdf.name] = {
            "pages": page_count(pdf),
            "articles": idx,
        }
        print(f"{pdf.name}: {page_count(pdf)} 页，索引 {len(idx)} 条款", file=sys.stderr)

    dest = RULES_DIR / "index.json"
    dest.write_text(json.dumps(out, ensure_ascii=False, indent=2))
    print(f"已写入 {dest}")

    # 抽查佩剑优先权章节
    tech = next((k for k in out if "technical" in k), None)
    if tech:
        arts = out[tech]["articles"]
        for a in ["t.96", "t.100", "t.101", "t.102", "t.105", "t.106"]:
            print(f"  {a} → 第 {arts.get(a, '?')} 页")


if __name__ == "__main__":
    main()
