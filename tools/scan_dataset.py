"""扫描巴黎奥运争议判罚素材库，生成数据集清单 (dataset manifest)。
文件夹 = 判罚情境类别（专家先验），文件名前缀 = 判罚归属（左/右）。
"""
import json, os, re, subprocess, sys
from pathlib import Path

# 素材目录：命令行参数 > 环境变量 FENCING_DATASET > 默认 data/raw。
# 原始素材是赛事转播片段，不随仓库分发，所以这里不写死任何本机路径。
ROOT = Path(sys.argv[1] if len(sys.argv) > 1
            else os.environ.get("FENCING_DATASET", "data/raw"))
OUT = Path(sys.argv[2] if len(sys.argv) > 2 else "tools/dataset_manifest.json")

# 文件夹名 -> 判罚情境 (FIE 术语映射)
SCENARIO = {
    "对攻原地抢攻": ("simultaneous_start", "对攻·原地抢攻", "双方几乎同时发起，比启动时序"),
    "对攻转换":     ("attack_derobement", "对攻·转换", "进攻中转移线，优先权是否延续"),
    "准备进攻、抬手": ("preparation_vs_attack", "准备进攻·抬手", "准备阶段被简单攻击击中"),
    "进攻一次没有":  ("attack_no", "进攻一次没有", "攻击未在前脚落地前完成"),
    "后退转换进攻":  ("retreat_counter", "后退转换进攻", "后退中转为反攻"),
    "同时":         ("simultaneous", "同时", "无法分辨先后，不判分"),
    "重复进攻":     ("remise", "重复进攻", "还击前的二次攻击"),
    "防守还击返还击": ("parry_riposte", "防守还击·返还击", "格挡后还击链"),
    "转换-收手":    ("withdraw_arm", "转换·收手", "收手导致优先权丧失"),
    "直接进攻":     ("direct_attack", "直接进攻", "单一直线攻击"),
    "放弃":         ("abandoned", "放弃", "放弃进攻"),
}

def probe(p: Path):
    try:
        r = subprocess.run(
            ["ffprobe", "-v", "error", "-select_streams", "v:0",
             "-show_entries", "stream=width,height,r_frame_rate,duration,nb_frames",
             "-of", "json", str(p)],
            capture_output=True, text=True, timeout=30)
        s = json.loads(r.stdout)["streams"][0]
        num, den = s["r_frame_rate"].split("/")
        fps = round(float(num) / float(den), 3)
        return {"width": s.get("width"), "height": s.get("height"), "fps": fps,
                "duration": round(float(s.get("duration", 0)), 3),
                "frames": int(s.get("nb_frames") or 0)}
    except Exception as e:
        return {"error": str(e)}

def verdict_from_name(name: str, scenario: str):
    """文件名前缀即专家标注的判罚归属。's' 后缀疑似慢放/特殊标记。

    「同时」类的文件名是原始录屏名（SVID_…）而没有左右前缀，
    但这不是「未标注」——该目录本身就代表判罚结果是「同时，双方不得分」。
    把它当成未标注会让系统在这类案例上无从被检验，
    而这恰恰是最该检验的一类：系统该不该忍住不判。
    """
    base = Path(name).stem
    if base.startswith("左"):
        return "left", base.startswith("左s")
    if base.startswith("右"):
        return "right", base.startswith("右s")
    if scenario == "simultaneous":
        return "simultaneous", False
    return "unlabeled", False

items, stats = [], {}
for d in sorted(ROOT.iterdir()):
    if not d.is_dir():
        continue
    key, zh, desc = SCENARIO.get(d.name, (d.name, d.name, ""))
    for f in sorted(d.glob("*.mp4")):
        verdict, slow = verdict_from_name(f.name, key)
        meta = probe(f)
        items.append({
            "id": f"{key}__{f.stem}".replace(" ", "_").replace("(", "").replace(")", ""),
            "file": str(f.relative_to(ROOT)),
            "abs": str(f),
            "scenario": key, "scenarioZh": zh, "scenarioDesc": desc,
            "expertVerdict": verdict, "slowMotion": slow, **meta,
        })
        stats.setdefault(key, {"zh": zh, "total": 0, "left": 0, "right": 0,
                                "simultaneous": 0, "unlabeled": 0})
        stats[key]["total"] += 1
        stats[key][verdict] += 1

manifest = {
    "source": "Paris 2024 Olympic Games — sabre contested calls",
    "curator": "马佳艺 / 北京体育大学",
    "root": str(ROOT),
    "count": len(items),
    "scenarios": stats,
    "items": items,
}
OUT.parent.mkdir(parents=True, exist_ok=True)
OUT.write_text(json.dumps(manifest, ensure_ascii=False, indent=2))
print(f"scanned {len(items)} clips -> {OUT}")
for k, v in stats.items():
    print(f"  {v['zh']:<14} total={v['total']:<4} 左={v['left']:<3} 右={v['right']:<3} "
          f"同时={v['simultaneous']:<3} 未标={v['unlabeled']}")
