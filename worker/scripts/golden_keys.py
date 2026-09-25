"""Writes {post id: classification cache key} computed by pipeline/analyze.py, for the Worker parity test."""
import hashlib, json, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "pipeline"))
sys.argv = [sys.argv[0]] + sys.argv[1:]
import analyze  # noqa: E402

src = Path(sys.argv[1])
out = Path(sys.argv[2])
qver = hashlib.sha1(json.dumps({k: q.model_dump() for k, q in analyze.QUESTIONS.items()}, sort_keys=True, default=str).encode()).hexdigest()[:8]
transcripts = json.loads((src / "transcripts.json").read_text())
keys = {}
for line in (src / "posts.jsonl").open():
    t = json.loads(line)
    st = analyze.state(t, transcripts)
    keys[t["id"]] = hashlib.sha1((qver + json.dumps(st, sort_keys=True)).encode()).hexdigest()[:16]
out.write_text(json.dumps(keys))
print(len(keys), "keys")
