"""Exports the radar's configuration from pipeline/*.py into worker/src/config/*.json.

Run from the repo root with the pipeline's Python environment:
    uv run python worker/scripts/export_config.py

User-visible strings are renamed (the product is "AGK Radar", the classifier is "AGK Intelligence",
the tracked model family is "System One"). The classification questions and the niche descriptions sent to
AGK Intelligence are exported verbatim so the classification cache (keyed by the question version) stays valid.
"""
import hashlib, json, re, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "pipeline"))
sys.argv = [sys.argv[0]]
import analyze, ideas, niches, plays  # noqa: E402

OUT = ROOT / "worker/src/config"


def rename(s):
    if not isinstance(s, str):
        return s
    s = s.replace("Jev Radar", "AGK Radar")
    s = re.sub(r"classified by Jev itself", "classified by AGK Intelligence", s)
    s = re.sub(r"classé par Jev lui-même", "classé par AGK Intelligence", s)
    s = re.sub(r"\bJev\b", "System One", s)
    s = s.replace("JEV(", "CLASSIFY(")  # spreadsheet-formula idea in the money plays
    return s


# Build breakdowns ("The system" on /builds, /top, /all and the post pages) are site-written text: the model is named
# "System One" there, never by a model id. Third-party project names stay as their authors wrote them (the "Code:"
# links keep them) but are not put forward in the sentence.
SYS_TEXT = [
    ("call System One as `typesafe-ai/jev` with state + questions", "call System One through the gateway with state + questions"),
    ("System One est appelable via le modèle `typesafe-ai/jev` avec state + questions", "System One est appelable via la passerelle avec state + questions"),
    ("Claude plugin (fast-jev-compaction): instead", "Claude plugin: instead"),
    ("Plugin Claude (fast-jev-compaction) : au lieu", "Plugin Claude : au lieu"),
    ("Cua's 'jev-use': computer control (macOS, Windows, Linux) where System One picks", "Computer control by Cua (macOS, Windows, Linux): System One picks"),
    ("« jev-use » de Cua : pilotage d'ordinateur (macOS, Windows, Linux) où System One choisit", "Pilotage d'ordinateur par Cua (macOS, Windows, Linux) : System One choisit"),
    # the author's project "Jev Use": the generic rename would invent a project called "System One Use"
    ("'System One Use' for Codex (China): System One is the decision layer", "Computer use for Codex (China): System One is the decision layer"),
    ("« System One Use » pour Codex (Chine) : System One sert de couche de décision", "Pilotage d'ordinateur pour Codex (Chine) : System One sert de couche de décision"),
]


def sys_text(s):
    s = rename(s)
    for a, b in SYS_TEXT:
        s = s.replace(a, b)
    s = re.sub(r"`?typesafe-ai/jev`?", "System One", s)  # any other model id
    # what is left of the name is inside a third-party "Code:" link
    assert not re.search(r"jev", re.sub(r"github\.com/\S+", "", s), re.I), s
    # and no project name was made up by the rename: "System One" never opens a quoted name ('System One Use')
    assert not re.search(r"(?:^|[\s(])(?:'|‘|«\s?)System One\b", s), s
    return s


def deep(o):
    if isinstance(o, dict):
        return {k: deep(v) for k, v in o.items()}
    if isinstance(o, list):
        return [deep(v) for v in o]
    return rename(o)


def dump(name, obj):
    (OUT / name).write_text(json.dumps(obj, ensure_ascii=False, indent=1) + "\n")


# 1. classification questions, verbatim (cache key parity with pipeline/analyze.py)
qdump = {k: q.model_dump() for k, q in analyze.QUESTIONS.items()}
qver = hashlib.sha1(json.dumps(qdump, sort_keys=True, default=str).encode()).hexdigest()[:8]
dump("questions.json", {"qver": qver, "questions": qdump})

# 2. niches: desc verbatim (sent to the model), labels renamed
dump("niches.json", {k: {"desc": v["desc"], **{f: rename(v[f]) for f in ("en", "fr", "idea_en", "idea_fr")}}
                     for k, v in niches.NICHES.items()})

# 3. ideas and their evaluation questions (renamed; the new wording triggers one re-evaluation of the 50 ideas)
CRIT = deep(ideas.CRITERIA)
QTEXT = deep(ideas.QUESTIONS_TEXT)
ENGINE = ("System One: a model that returns fast typed decisions (choice, score, yes/no probability) for $0.042 "
          "per million input tokens, in ~100-500 ms. It cannot generate text.")
qv = hashlib.sha1(json.dumps({k: [QTEXT[k], v] for k, v in CRIT.items()}).encode()).hexdigest()[:8]
out_ideas = []
for i in ideas.IDEAS:
    i = deep(i)
    st = {"product": i["en"], "pitch": i["pen"], "buyer": i["ben"], "pricing": i["price"], "engine": ENGINE}
    i["_state"] = st
    i["_h"] = qv + hashlib.sha1(json.dumps(st, sort_keys=True).encode()).hexdigest()[:10]
    out_ideas.append(i)
dump("ideas.json", {"ideas": out_ideas, "criteria": CRIT, "questions_text": QTEXT, "weights": ideas.IDEA_WEIGHTS,
                    "engine": ENGINE})

# 4. money plays and system breakdowns (renamed)
dump("plays.json", deep(plays.PLAYS))
dump("systems.json", {k: {f: sys_text(t) for f, t in v.items()} for k, v in json.loads((ROOT / "pipeline/systems.json").read_text()).items()})

# 5. seeds (accounts and status links)
seeds = [l.strip() for l in (ROOT / "pipeline/seeds.txt").read_text().splitlines() if l.strip() and not l.strip().startswith("#")]
dump("seeds.json", seeds)
print(f"exported: qver={qver}, {len(niches.NICHES)} niches, {len(out_ideas)} ideas, {len(plays.PLAYS)} plays, {len(seeds)} seeds")
