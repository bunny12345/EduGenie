#!/usr/bin/env python3
import json, os

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FEED = os.path.join(BASE, "local-data", "local-feed.json")
TEACHERS = os.path.join(BASE, "local-data", "teacher-accounts.json")

with open(FEED) as f:
    feed = json.load(f)
with open(TEACHERS) as f:
    teachers = json.load(f)

# teacherId -> set of lowercase class names
tc = {}
for t in teachers:
    tid = t.get("teacherId", "")
    tc[tid] = set(g.lower() for g in t.get("grades", []))

hw = feed.get("homework", [])
cleaned = []
removed = 0
for h in hw:
    cb = str(h.get("created_by", ""))
    hc = str(h.get("class_name", "")).strip().lower()
    if cb and hc and cb in tc and hc not in tc[cb]:
        removed += 1
        print(f"REMOVE: {h.get('subject')} | class={h.get('class_name')} | student={str(h.get('student_id',''))[:8]}... | by={cb[:8]}...")
        continue
    cleaned.append(h)

feed["homework"] = cleaned
with open(FEED, "w") as f:
    json.dump(feed, f)

print(f"\nRemoved {removed} cross-class entries. {len(cleaned)} remain.")
