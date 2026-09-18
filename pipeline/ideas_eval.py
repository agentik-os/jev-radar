"""Jev note chaque idée de la bibliothèque sur 6 critères (Score 0-4). Cache par contenu.
Sortie : data/ideas_eval.json {clé: {critère: score, critère_conf: confiance}}."""
import hashlib, json
from concurrent.futures import ThreadPoolExecutor

from typesafe_sdk import Score, TypeSafeClient

from common import DATA, load_key, read_json, write_json
from ideas import CRITERIA, IDEAS, QUESTIONS_TEXT

QUESTIONS = {k: Score(instructions=QUESTIONS_TEXT[k], criteria=v) for k, v in CRITERIA.items()}


def state(i):
    return {"product": i["en"], "pitch": i["pen"], "buyer": i["ben"], "pricing": i["price"],
            "engine": "Jev: a model that returns fast typed decisions (choice, score, yes/no probability) for $0.042 per million input tokens, in ~100-500 ms. It cannot generate text."}


def main():
    load_key()
    out = read_json(DATA / "ideas_eval.json", {})
    client = TypeSafeClient(timeout=60.0)
    qv = hashlib.sha1(json.dumps({k: [QUESTIONS_TEXT[k], v] for k, v in CRITERIA.items()}).encode()).hexdigest()[:8]
    todo = []
    for i in IDEAS:
        h = qv + hashlib.sha1(json.dumps(state(i), sort_keys=True).encode()).hexdigest()[:10]
        if out.get(i["k"], {}).get("_h") != h:
            todo.append((i, h))

    def ask(item):
        i, h = item
        r = client.system_one(state=state(i), questions=QUESTIONS, model="jev-latest")
        res = {"_h": h}
        for k, a in r.answers.items():
            res[k], res[k + "_conf"] = round(a.score, 2), round(a.confidence, 2)
        return i["k"], res

    with ThreadPoolExecutor(8) as pool:
        for k, res in pool.map(ask, todo):
            out[k] = res
    keys = {i["k"] for i in IDEAS}
    write_json(DATA / "ideas_eval.json", {k: v for k, v in out.items() if k in keys})
    print(f"idées : {len(IDEAS)} au total, {len(todo)} (re)notées par Jev")


if __name__ == "__main__":
    main()
