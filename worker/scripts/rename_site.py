"""One-time rename of the site's user-visible strings: product "AGK Radar", classifier "AGK Intelligence",
tracked model family "System One". The vendor name stays only in the credits/independence line."""
import re, sys
from pathlib import Path

ORDERED = [
    ("Jev Radar", "AGK Radar"), ("Jev <em>Radar</em>", "AGK <em>Radar</em>"), ("jev.agentik-os.com", "radar.agentik-os.com"),
    # the classifier is AGK Intelligence
    ("Classified by Jev itself", "Classified by AGK Intelligence"), ("classified by Jev itself", "classified by AGK Intelligence"),
    ("Classé par Jev lui-même", "Classé par AGK Intelligence"), ("classé par Jev lui-même", "classé par AGK Intelligence"),
    ("classified by Jev", "classified by AGK Intelligence"), ("classified by Jev into", "classified by AGK Intelligence into"),
    ("Tell Jev who you are. It ranks", "Tell AGK Intelligence who you are. It ranks"),
    ("Dis à Jev qui tu es. Il classe", "Dis à AGK Intelligence qui tu es. Elle classe"),
    ("Jev is ranking the plays", "AGK Intelligence is ranking the plays"), ("Jev classe les pistes", "AGK Intelligence classe les pistes"),
    ("Ranked for you by Jev", "Ranked for you by AGK Intelligence"), ("Classé pour toi par Jev", "Classé pour toi par AGK Intelligence"),
    ("personalize with Jev", "personalize with AGK Intelligence"), ("pour que Jev personnalise", "pour qu'AGK Intelligence personnalise"),
    ("scored by Jev", "scored by AGK Intelligence"), ("notées par Jev", "notées par AGK Intelligence"),
    ("Test your own idea with Jev", "Test your own idea with AGK Intelligence"), ("Teste ta propre idée avec Jev", "Teste ta propre idée avec AGK Intelligence"),
    ("Jev scores it", "AGK Intelligence scores it"), ("Jev le note", "AGK Intelligence le note"),
    ("Could not reach Jev", "Could not reach AGK Intelligence"), ("Impossible de joindre Jev", "Impossible de joindre AGK Intelligence"),
    ("Jev's judgments", "AGK Intelligence's judgments"), ("Jev's judgment", "AGK Intelligence's judgment"),
    ("jugements de Jev", "jugements d'AGK Intelligence"), ("jugement de Jev", "jugement d'AGK Intelligence"),
    ("is classified by Jev into", "is classified by AGK Intelligence into"), ("Jev classe chaque post", "AGK Intelligence classe chaque post"),
    ("graded by Jev", "graded by AGK Intelligence"), ("Ranked by Jev", "Ranked by AGK Intelligence"), ("classés par Jev", "classés par AGK Intelligence"),
    # the vendor appears only in the credits / independence line
    ("TypeSafe's System One model", "the System One model"), ("modèle System One de TypeSafe", "modèle System One"),
    ("TypeSafe's Jev", "System One"), ("Official TypeSafe", "Official"), ("Officiel TypeSafe", "Officiel"),
    ('"API TypeSafe · SDK Python / JS"', '"Provider API · Python / JS SDK"'), ('"Docs TypeSafe"', '"Provider docs"'),
    ("JEV_CONFIG", "AGK_CONFIG"),
]


def rename(s):
    for a, b in ORDERED:
        s = s.replace(a, b)
    return re.sub(r"\bJev\b", "System One", s)


for f in sys.argv[1:]:
    p = Path(f)
    before = p.read_text()
    after = rename(before)
    p.write_text(after)
    print(f"{f}: {len(re.findall(r'(?i)jev', before))} -> {len(re.findall(r'(?i)jev', after))} case-insensitive 'jev' hits")
