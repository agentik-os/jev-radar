"""Transcrit les nouvelles vidéos des posts Jev. Mac : whisper.cpp (whisper-cli) ; CI : faster-whisper.
Les vidéos sans piste audio sont marquées vides sans téléchargement du modèle.
Sortie : data/transcripts.json {video_id: texte}."""
import json, shutil, subprocess, tempfile, urllib.request
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

from common import DATA, load_posts, read_json, write_json

OUT = DATA / "transcripts.json"
MAX_SECONDS = 1800
WHISPER_CPP_MODEL = Path.home() / "Library/Application Support/AutoTrim/whisper/ggml-small.bin"
_fw = None


def smallest_mp4(v):
    mp4 = [f for f in v.get("formats", []) if f.get("container") == "mp4" and f.get("url")]
    return min(mp4, key=lambda f: f.get("bitrate") or 1e12)["url"] if mp4 else v["url"]


def has_audio(path):
    r = subprocess.run(["ffprobe", "-v", "error", "-select_streams", "a", "-show_entries", "stream=index",
                        "-of", "csv=p=0", path], capture_output=True, text=True)
    return bool(r.stdout.strip())


def run_whisper(wav):
    global _fw
    if shutil.which("whisper-cli") and WHISPER_CPP_MODEL.exists():
        r = subprocess.run(["whisper-cli", "-m", WHISPER_CPP_MODEL, "-f", wav, "-nt", "-l", "auto", "-t", "4"],
                           capture_output=True, text=True, errors="replace", timeout=1200)
        return r.stdout
    if _fw is None:
        from faster_whisper import WhisperModel
        _fw = WhisperModel("small", device="cpu", compute_type="int8")
    segments, _ = _fw.transcribe(str(wav), vad_filter=True)
    return " ".join(s.text for s in segments)


def transcribe(v):
    with tempfile.TemporaryDirectory() as d:
        mp4, wav = Path(d) / "v.mp4", Path(d) / "v.wav"
        try:
            req = urllib.request.Request(smallest_mp4(v), headers={"User-Agent": "Mozilla/5.0"})
            mp4.write_bytes(urllib.request.urlopen(req, timeout=120).read())
            if not has_audio(mp4):
                return v["id"], ""
            subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", mp4, "-t", str(MAX_SECONDS),
                            "-ar", "16000", "-ac", "1", wav], check=True)
            return v["id"], " ".join(run_whisper(wav).split())
        except Exception as e:
            return v["id"], f"[échec : {type(e).__name__}]"


def main():
    done = read_json(OUT, {})
    vids = {}
    for t in load_posts().values():
        for v in (t.get("media") or {}).get("videos") or []:
            if v.get("type") == "video" and v["id"] not in done:
                vids[v["id"]] = v
    print(f"{len(vids)} vidéos à transcrire", flush=True)
    # faster-whisper n'est pas thread-safe à l'initialisation : un seul worker en CI
    workers = 3 if shutil.which("whisper-cli") else 1
    with ThreadPoolExecutor(workers) as pool:
        for vid, text in pool.map(transcribe, vids.values()):
            done[vid] = text
            write_json(OUT, done)


if __name__ == "__main__":
    main()
