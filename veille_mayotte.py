#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
veille_mayotte.py — veille des offres d'emploi du 976 + preparation de candidatures.

Ce que ca fait :
  1. recupere les offres actives du departement 976 via l'API officielle
     France Travail "Offres d'emploi v2" (gratuite, OAuth2 client_credentials)
  2. dedoublonne dans un SQLite : tu ne revois jamais deux fois la meme offre
  3. score chaque offre contre ton profil (mots-cles ponderes + exclusions)
  4. genere pour les offres retenues un brouillon (lettre de motivation + CV)
     que TU relis et envoies

Ce que ca ne fait PAS, volontairement :
  - ca n'envoie aucun mail tout seul
  - ca ne poste rien sur la plateforme France Travail (interdit par les CGU)

Zero dependance : stdlib uniquement.

Usage :
    python3 veille_mayotte.py init            # cree profil.json a remplir
    python3 veille_mayotte.py scan --rome     # nouvelles offres 976
    python3 veille_mayotte.py prep --min 12   # brouillons
    python3 veille_mayotte.py envoyer         # mobile, une offre a la fois
    python3 veille_mayotte.py list            # tout l'historique
    python3 veille_mayotte.py ignore 187ABCD  # sortir une offre du flux
"""

from __future__ import annotations

import argparse
import json
import os
import re
import shutil
import sqlite3
import subprocess
import sys
import time
import unicodedata
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime
from email.message import EmailMessage
from pathlib import Path

# --------------------------------------------------------------------------- #
#  Constantes
# --------------------------------------------------------------------------- #

BASE = Path(__file__).resolve().parent
DB_PATH = BASE / "offres976.db"
PROFIL_PATH = BASE / "profil.json"
OUT_DIR = BASE / "brouillons"

# Mode mobile (Termux) : on ecrit dans le stockage partage, seul endroit que
# Gmail et les autres applis Android savent lire. Necessite termux-setup-storage.
SHARED = Path.home() / "storage" / "shared"
MOBILE_DIR = (SHARED / "Download" / "candidatures976") if SHARED.is_dir() else OUT_DIR

TOKEN_URL = (
    "https://entreprise.francetravail.fr/connexion/oauth2/access_token"
    "?realm=%2Fpartenaire"
)
SEARCH_URL = "https://api.francetravail.io/partenaire/offresdemploi/v2/offres/search"
SCOPE = "api_offresdemploiv2 o2dsoffre"

ANTHROPIC_URL = "https://api.anthropic.com/v1/messages"
ANTHROPIC_MODEL = "claude-sonnet-5"

PAGE = 150        # taille de page max de l'API
RANGE_MAX = 1149  # plafond dur de l'API (range 0-0 a 1000-1149)
DEPT = "976"

# Codes ROME cibles pour un technicien informatique niveau 4 (bac) :
#   I1401 Maintenance informatique et bureautique  <- le coeur de cible
#   I1404 Conseiller support technique informatique
#   M1810 Production et exploitation de systemes d'information
#   H1101 Assistance et support technique client
#   M1801 Administration de systemes d'information (souvent au-dessus, mais
#         les petites collectivites y rangent des postes de technicien)
ROME_TECH = "I1401,I1404,M1810,H1101,M1801"


def sur_termux() -> bool:
    return "com.termux" in os.environ.get("PREFIX", "") or SHARED.is_dir()


def termux(cmd: list[str], entree: str | None = None) -> bool:
    """Lance un outil termux-api s'il est present. Retourne False sinon."""
    if not shutil.which(cmd[0]):
        return False
    try:
        subprocess.run(cmd, input=entree, text=True, check=True,
                       timeout=25, capture_output=True)
        return True
    except Exception:
        return False


# --------------------------------------------------------------------------- #
#  Utilitaires
# --------------------------------------------------------------------------- #

def die(msg: str, code: int = 1):
    print(f"[x] {msg}", file=sys.stderr)
    sys.exit(code)


def deaccent(s: str) -> str:
    return "".join(
        c for c in unicodedata.normalize("NFD", s)
        if unicodedata.category(c) != "Mn"
    ).lower()


def slug(s: str, n: int = 45) -> str:
    s = re.sub(r"[^a-z0-9]+", "-", deaccent(s)).strip("-")
    return s[:n] or "offre"


def http(url, *, data=None, headers=None, method=None, timeout=30):
    """Retourne (status, bytes, headers) sans lever sur 4xx/5xx."""
    req = urllib.request.Request(url, data=data, headers=headers or {}, method=method)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return r.status, r.read(), dict(r.headers)
    except urllib.error.HTTPError as e:
        return e.code, e.read(), dict(e.headers)
    except urllib.error.URLError as e:
        die(f"reseau injoignable : {e.reason}")


# --------------------------------------------------------------------------- #
#  API France Travail
# --------------------------------------------------------------------------- #

def ft_token() -> str:
    cid = os.environ.get("FT_CLIENT_ID")
    sec = os.environ.get("FT_CLIENT_SECRET")
    if not cid or not sec:
        die("exporte FT_CLIENT_ID et FT_CLIENT_SECRET (cf. francetravail.io)")

    body = urllib.parse.urlencode({
        "grant_type": "client_credentials",
        "client_id": cid,
        "client_secret": sec,
        "scope": SCOPE,
    }).encode()

    st, raw, _ = http(
        TOKEN_URL, data=body,
        headers={"Content-Type": "application/x-www-form-urlencoded"},
    )
    if st != 200:
        die(f"auth France Travail HTTP {st} : {raw[:300].decode(errors='replace')}")
    tok = json.loads(raw).get("access_token")
    if not tok:
        die("reponse d'auth sans access_token")
    return tok


def ft_search(token: str, dept: str = DEPT, extra: dict | None = None) -> list[dict]:
    """Pagine via range. L'API renvoie 200 (complet), 206 (partiel), 204 (vide)."""
    out, start, retry = [], 0, 0
    while start <= RANGE_MAX:
        end = min(start + PAGE - 1, RANGE_MAX)
        params = {"departement": dept, "range": f"{start}-{end}"}
        if extra:
            params.update(extra)
        url = f"{SEARCH_URL}?{urllib.parse.urlencode(params)}"

        st, raw, hdr = http(url, headers={
            "Authorization": f"Bearer {token}",
            "Accept": "application/json",
        })

        if st == 204:                      # plus rien
            break
        if st == 429 and retry < 5:        # plafond 10 req/s
            retry += 1
            time.sleep(1.5 * retry)
            continue
        if st not in (200, 206):
            die(f"API offres HTTP {st} : {raw[:300].decode(errors='replace')}")

        retry = 0
        batch = json.loads(raw or b"{}").get("resultats") or []
        out.extend(batch)

        total = None
        cr = hdr.get("Content-Range") or hdr.get("content-range") or ""
        m = re.search(r"/(\d+)$", cr)
        if m:
            total = int(m.group(1))

        if st == 200 or len(batch) < PAGE or (total is not None and end + 1 >= total):
            break
        start = end + 1
        time.sleep(0.15)
    return out


def normalise(o: dict) -> dict:
    contact = o.get("contact") or {}
    origine = o.get("origineOffre") or {}
    ent = o.get("entreprise") or {}
    lieu = o.get("lieuTravail") or {}
    oid = o.get("id") or ""
    return {
        "id": oid,
        "intitule": (o.get("intitule") or "").strip(),
        "entreprise": (ent.get("nom") or "").strip(),
        "lieu": (lieu.get("libelle") or "").strip(),
        "contrat": (o.get("typeContratLibelle") or o.get("typeContrat") or "").strip(),
        "date": (o.get("dateCreation") or "")[:10],
        "url": origine.get("urlOrigine")
               or f"https://candidat.francetravail.fr/offres/recherche/detail/{oid}",
        "courriel": (contact.get("courriel") or "").strip(),
        "contact_nom": (contact.get("nom") or "").strip(),
        "description": (o.get("description") or "").strip(),
    }


# --------------------------------------------------------------------------- #
#  Base locale
# --------------------------------------------------------------------------- #

SCHEMA = """
CREATE TABLE IF NOT EXISTS offres (
    id           TEXT PRIMARY KEY,
    intitule     TEXT, entreprise TEXT, lieu TEXT, contrat TEXT,
    date_offre   TEXT, url TEXT, courriel TEXT, contact_nom TEXT,
    description  TEXT,
    score        INTEGER DEFAULT 0,
    hits         TEXT,
    statut       TEXT DEFAULT 'nouveau',
    vue_le       TEXT,
    lettre       TEXT
);
"""


def db() -> sqlite3.Connection:
    con = sqlite3.connect(DB_PATH)
    con.row_factory = sqlite3.Row
    con.executescript(SCHEMA)
    try:  # base creee par une version anterieure du script
        con.execute("ALTER TABLE offres ADD COLUMN lettre TEXT")
        con.commit()
    except sqlite3.OperationalError:
        pass
    return con


def enregistre(con, offres: list[dict], profil: dict) -> list[sqlite3.Row]:
    now = datetime.now().isoformat(timespec="seconds")
    nouveaux = []
    for o in offres:
        if not o["id"]:
            continue
        if con.execute("SELECT 1 FROM offres WHERE id=?", (o["id"],)).fetchone():
            continue
        pts, hits = note(o, profil)
        con.execute(
            "INSERT INTO offres (id,intitule,entreprise,lieu,contrat,date_offre,"
            "url,courriel,contact_nom,description,score,hits,statut,vue_le) "
            "VALUES (?,?,?,?,?,?,?,?,?,?,?,?,'nouveau',?)",
            (o["id"], o["intitule"], o["entreprise"], o["lieu"], o["contrat"],
             o["date"], o["url"], o["courriel"], o["contact_nom"],
             o["description"], pts, ", ".join(hits), now),
        )
        nouveaux.append(o["id"])
    con.commit()
    if not nouveaux:
        return []
    q = ",".join("?" * len(nouveaux))
    return con.execute(
        f"SELECT * FROM offres WHERE id IN ({q}) ORDER BY score DESC", nouveaux
    ).fetchall()


# --------------------------------------------------------------------------- #
#  Scoring
# --------------------------------------------------------------------------- #

def note(offre: dict, profil: dict) -> tuple[int, list[str]]:
    txt = deaccent(f"{offre['intitule']} {offre['entreprise']} {offre['description']}")
    titre = deaccent(offre["intitule"])
    pts, hits = 0, []

    for kw, poids in (profil.get("mots_cles") or {}).items():
        k = deaccent(kw)
        if k in titre:                 # dans l'intitule : compte double
            pts += int(poids) * 2
            hits.append(f"{kw}!")
        elif k in txt:
            pts += int(poids)
            hits.append(kw)

    for kw in (profil.get("exclusions") or []):
        if deaccent(kw) in txt:
            pts -= 12
            hits.append(f"-{kw}")

    if offre["courriel"]:              # candidature directe possible
        pts += 2
    return pts, hits


# --------------------------------------------------------------------------- #
#  Lettre de motivation
# --------------------------------------------------------------------------- #

MODELE_LM = """Madame, Monsieur,

Je vous adresse ma candidature au poste de {intitule} ({contrat}) publie par {entreprise}
a {lieu}, reference {ref}.

{pitch}

Installe a Mayotte, je connais les contraintes de terrain du territoire et je suis
disponible pour un entretien a votre convenance. Mon CV est joint a ce message.

Je vous remercie de l'attention portee a ma candidature.

Cordialement,
{nom}
{tel} — {email}
"""


def lettre_ia(offre: sqlite3.Row, profil: dict) -> str:
    cle = os.environ.get("ANTHROPIC_API_KEY")
    if not cle:
        raise RuntimeError("ANTHROPIC_API_KEY absente")

    prompt = (
        "Redige le corps d'une lettre de motivation en francais pour la candidature "
        "ci-dessous.\n\n"
        "Contraintes : 150 a 200 mots. Ton sobre et direct. Aucune formule pompeuse, "
        "pas de \"je suis passionne par\", pas de \"votre prestigieuse structure\". "
        "Accroche sur UN point concret et verifiable de l'offre mis en face d'UN "
        "element precis du profil. Rends uniquement le corps du texte : ni objet, "
        "ni \"Madame, Monsieur\", ni signature.\n\n"
        "PROFIL DU CANDIDAT\n"
        f"{json.dumps(profil.get('candidat', {}), ensure_ascii=False, indent=2)}\n"
        f"Experiences cles : {profil.get('pitch', '')}\n\n"
        "OFFRE\n"
        f"Intitule : {offre['intitule']}\n"
        f"Employeur : {offre['entreprise']}\n"
        f"Lieu : {offre['lieu']} — Contrat : {offre['contrat']}\n"
        f"Description :\n{(offre['description'] or '')[:2500]}\n"
    )

    body = json.dumps({
        "model": ANTHROPIC_MODEL,
        "max_tokens": 700,
        "messages": [{"role": "user", "content": prompt}],
    }).encode()

    st, raw, _ = http(ANTHROPIC_URL, data=body, timeout=90, headers={
        "x-api-key": cle,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
    })
    if st != 200:
        raise RuntimeError(f"HTTP {st} {raw[:200].decode(errors='replace')}")
    blocs = json.loads(raw).get("content", [])
    txt = "\n".join(b.get("text", "") for b in blocs if b.get("type") == "text").strip()
    if not txt:
        raise RuntimeError("reponse vide")
    return txt


def lettre(offre: sqlite3.Row, profil: dict, ia: bool) -> str:
    pitch = profil.get("pitch", "").strip()
    if ia:
        try:
            pitch = lettre_ia(offre, profil)
        except Exception as e:
            print(f"    ~ LM generique (IA indispo : {e})", file=sys.stderr)
    c = profil.get("candidat", {})
    return MODELE_LM.format(
        intitule=offre["intitule"] or "poste propose",
        contrat=offre["contrat"] or "contrat a preciser",
        entreprise=offre["entreprise"] or "votre structure",
        lieu=offre["lieu"] or "Mayotte",
        ref=offre["id"],
        pitch=pitch,
        nom=c.get("nom", ""),
        tel=c.get("tel", ""),
        email=c.get("email", ""),
    )


# --------------------------------------------------------------------------- #
#  Brouillons
# --------------------------------------------------------------------------- #

def brouillon(offre: sqlite3.Row, profil: dict, cv: Path | None, ia: bool) -> Path:
    c = profil.get("candidat", {})
    corps = lettre(offre, profil, ia)
    dest = offre["courriel"]

    if not dest:
        corps = (
            "### PAS D'EMAIL DE CONTACT SUR CETTE OFFRE ###\n"
            f"### Postule directement ici : {offre['url']}\n"
            f"### Reference a citer : {offre['id']}\n"
            "### (ce brouillon t'est adresse a toi, pour copier-coller la LM)\n\n"
            + corps
        )
        dest = c.get("email", "")

    m = EmailMessage()
    m["From"] = f"{c.get('nom','')} <{c.get('email','')}>"
    m["To"] = dest
    m["Subject"] = f"Candidature — {offre['intitule']} (ref. {offre['id']})"
    m.set_content(corps)

    if cv and cv.exists():
        sub = "pdf" if cv.suffix.lower() == ".pdf" else "octet-stream"
        m.add_attachment(cv.read_bytes(), maintype="application",
                         subtype=sub, filename=cv.name)

    OUT_DIR.mkdir(exist_ok=True)
    p = OUT_DIR / f"{offre['score']:03d}_{slug(offre['intitule'])}_{offre['id']}.eml"
    p.write_bytes(bytes(m))
    return p


def brouillon_txt(offre: sqlite3.Row, profil: dict, ia: bool) -> tuple[Path, str]:
    """Sortie Android : un .txt lisible, dans un dossier visible depuis Gmail.

    Pas de .eml ici : aucune appli mail Android ne sait ouvrir un .eml comme
    brouillon. On sort le texte, et 'envoyer' s'occupe du presse-papier.
    """
    corps = lettre(offre, profil, ia)
    dest = offre["courriel"] or "(aucun — postuler sur le site)"
    entete = (
        f"POSTE     : {offre['intitule']}\n"
        f"EMPLOYEUR : {offre['entreprise']}\n"
        f"LIEU      : {offre['lieu']}    CONTRAT : {offre['contrat']}\n"
        f"REFERENCE : {offre['id']}\n"
        f"DESTINATAIRE : {dest}\n"
        f"OBJET     : Candidature - {offre['intitule']} (ref. {offre['id']})\n"
        f"OFFRE     : {offre['url']}\n"
        + "=" * 60 + "\n\n"
    )

    MOBILE_DIR.mkdir(parents=True, exist_ok=True)
    p = MOBILE_DIR / f"{offre['score']:03d}_{slug(offre['intitule'])}_{offre['id']}.txt"
    p.write_text(entete + corps, encoding="utf-8")
    return p, corps


# --------------------------------------------------------------------------- #
#  Affichage
# --------------------------------------------------------------------------- #

def tableau(rows):
    if not rows:
        print("  (rien)")
        return
    for r in rows:
        mail = "@" if r["courriel"] else "·"
        print(f"  [{r['score']:>3}] {mail} {r['id']}  {(r['intitule'] or '')[:54]}")
        print(f"        {(r['entreprise'] or '?')[:34]} | {(r['lieu'] or '?')[:22]}"
              f" | {(r['contrat'] or '?')[:14]}")
        if r["hits"]:
            print(f"        ↳ {r['hits'][:90]}")


# --------------------------------------------------------------------------- #
#  Commandes
# --------------------------------------------------------------------------- #

SQUELETTE = {
    "candidat": {
        "nom": "Prenom NOM",
        "email": "toi@exemple.com",
        "tel": "06 39 XX XX XX",
        "ville": "Mayotte (976)",
        "niveau": "Niveau 4 RNCP (equivalent bac)",
        "permis": "B",
    },
    "pitch": (
        "Deux phrases sur ton parcours, reutilisees telles quelles si l'IA est coupee."
    ),
    "cv": "cv.pdf",
    "mots_cles": {
        "technicien informatique": 10, "technicien support": 9,
        "assistance informatique": 9, "maintenance informatique": 9,
        "support informatique": 8, "parc informatique": 7,
        "technicien reseau": 7, "poste de travail": 6, "helpdesk": 6,
        "technicien territorial": 6, "hotline": 5, "depannage": 5, "nas": 5,
        "docker": 5, "technicien": 4, "informatique": 4, "bureautique": 4,
        "reseau": 4, "sauvegarde": 4, "linux": 4, "active directory": 4,
        "adjoint technique": 4, "debutant accepte": 4, "utilisateurs": 3,
        "installation": 3, "windows": 3, "numerique": 3, "mairie": 3,
        "collectivite": 3, "ccas": 3, "bac": 3,
    },
    "exclusions": [
        "ingenieur", "bac + 5", "bac+5", "bac + 3", "architecte",
        "chef de projet", "directeur des systemes", "responsable de service",
        "5 ans d'experience", "10 ans d'experience", "commercial terrain",
        "vente a domicile", "securite incendie", "agent de securite",
    ],
}


def cmd_init(_):
    if PROFIL_PATH.exists():
        die(f"{PROFIL_PATH.name} existe deja, je n'ecrase pas")
    PROFIL_PATH.write_text(
        json.dumps(SQUELETTE, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    print(f"[+] {PROFIL_PATH.name} cree. Remplis-le, pose ton cv.pdf a cote, puis :")
    print("    python3 veille_mayotte.py scan --rome")


def charge_profil() -> dict:
    if not PROFIL_PATH.exists():
        die("pas de profil.json — lance d'abord : python3 veille_mayotte.py init")
    return json.loads(PROFIL_PATH.read_text(encoding="utf-8"))


def cmd_scan(a):
    profil = charge_profil()
    print("[*] auth France Travail...")
    tok = ft_token()

    extra = None
    if a.rome:
        extra = {"codeROME": ROME_TECH if a.rome == "tech" else a.rome}
        print(f"[*] filtre ROME : {extra['codeROME']}")

    print(f"[*] recuperation des offres {a.dept}...")
    brutes = [normalise(o) for o in ft_search(tok, a.dept, extra)]
    print(f"[*] {len(brutes)} offres actives sur le territoire")

    con = db()
    neufs = enregistre(con, brutes, profil)
    print(f"\n=== {len(neufs)} NOUVELLE(S) OFFRE(S) ===")
    tableau(neufs)

    ret = [r for r in neufs if r["score"] >= a.min]
    print(f"\n[=] {len(ret)} au-dessus du seuil {a.min}")
    con.close()


def cmd_prep(a):
    profil = charge_profil()
    mobile = a.mobile or (sur_termux() and not a.eml)

    cv = BASE / profil.get("cv", "cv.pdf")
    if not cv.exists():
        print(f"[!] CV introuvable ({cv.name})", file=sys.stderr)
        cv = None

    con = db()
    rows = con.execute(
        "SELECT * FROM offres WHERE statut='nouveau' AND score>=? "
        "ORDER BY score DESC LIMIT ?", (a.min, a.max)
    ).fetchall()
    if not rows:
        print("[=] rien a preparer")
        con.close()
        return

    print(f"[*] {len(rows)} brouillon(s) — mode {'mobile' if mobile else 'eml'}, "
          f"IA={'non' if a.no_ia else 'oui'}")

    for r in rows:
        try:
            corps = None
            if mobile:
                p, corps = brouillon_txt(r, profil, ia=not a.no_ia)
            else:
                p = brouillon(r, profil, cv, ia=not a.no_ia)
        except Exception as e:
            print(f"  [!] {r['id']} : {e}", file=sys.stderr)
            continue
        con.execute("UPDATE offres SET statut='prepare', lettre=? WHERE id=?",
                    (corps, r["id"]))
        con.commit()
        flag = "" if r["courriel"] else "  (pas d'email → a postuler en ligne)"
        print(f"  [{r['score']:>3}] {p.name}{flag}")

    if mobile:
        if cv:
            cible = MOBILE_DIR / cv.name
            if not cible.exists() or cible.stat().st_mtime < cv.stat().st_mtime:
                shutil.copy2(cv, cible)
            print(f"\n[+] CV copie dans {MOBILE_DIR}")
        print(f"[+] {len(rows)} lettre(s) dans {MOBILE_DIR}")
        print("[+] Enchaine : python3 veille_mayotte.py envoyer")
    else:
        print(f"\n[+] Fichiers dans {OUT_DIR}/")
    con.close()


def cmd_envoyer(a):
    """Flux mobile : une offre a la fois. LM dans le presse-papier + mail ouvert."""
    con = db()
    r = con.execute(
        "SELECT * FROM offres WHERE statut='prepare' AND courriel!='' "
        "AND lettre IS NOT NULL ORDER BY score DESC LIMIT 1"
    ).fetchone()
    if not r:
        print("[=] plus rien de pret a envoyer par mail.")
        print("    (offres sans email : python3 veille_mayotte.py list --statut prepare)")
        con.close()
        return

    objet = f"Candidature - {r['intitule']} (ref. {r['id']})"
    print(f"\n[{r['score']} pts] {r['intitule']}")
    print(f"  {r['entreprise']} — {r['lieu']} — {r['contrat']}")
    print(f"  → {r['courriel']}\n")
    print("-" * 58)
    print(r["lettre"])
    print("-" * 58)

    rep = input("\n[o] envoyer  [s] ignorer cette offre  [autre] plus tard : ")
    rep = rep.strip().lower()
    if rep == "s":
        con.execute("UPDATE offres SET statut='ignore' WHERE id=?", (r["id"],))
        con.commit()
        con.close()
        print("[=] ignoree, elle ne reviendra plus.")
        return
    if rep != "o":
        con.close()
        print("[=] laissee de cote, elle ressortira au prochain 'envoyer'.")
        return

    if termux(["termux-clipboard-set"], entree=r["lettre"]):
        print("[+] lettre copiee dans le presse-papier")
    else:
        print("[!] termux-api absent : copie la lettre depuis le .txt")

    url = ("mailto:" + urllib.parse.quote(r["courriel"])
           + "?subject=" + urllib.parse.quote(objet))
    if not termux(["termux-open-url", url]):
        print(f"[!] ouvre manuellement : {url}")

    print("\n  Dans l'appli mail : coller + joindre le CV depuis")
    print(f"  {MOBILE_DIR.name}/, puis relance 'envoyer' pour la suivante.")
    con.execute("UPDATE offres SET statut='envoye' WHERE id=?", (r["id"],))
    con.commit()
    con.close()


def cmd_list(a):
    con = db()
    if a.statut:
        rows = con.execute("SELECT * FROM offres WHERE statut=? ORDER BY score DESC",
                           (a.statut,)).fetchall()
    else:
        rows = con.execute("SELECT * FROM offres ORDER BY score DESC").fetchall()
    tableau(rows)
    for s, n in con.execute("SELECT statut, COUNT(*) FROM offres GROUP BY statut"):
        print(f"  {s}: {n}")
    con.close()


def cmd_ignore(a):
    con = db()
    o = con.execute("SELECT * FROM offres WHERE id=?", (a.id,)).fetchone()
    if not o:
        die(f"offre {a.id} introuvable")
    con.execute("UPDATE offres SET statut='ignore' WHERE id=?", (a.id,))
    con.commit()
    print(f"[+] {o['id']} marque comme ignore")
    con.close()


# --------------------------------------------------------------------------- #
#  Main
# --------------------------------------------------------------------------- #

def main():
    parser = argparse.ArgumentParser(description="Veille des offres d'emploi Mayotte")
    subcmds = parser.add_subparsers(dest="cmd", required=True)

    sub_init = subcmds.add_parser("init", help="Cree profil.json d'exemple")
    sub_init.set_defaults(f=cmd_init)

    sub_scan = subcmds.add_parser("scan", help="Recupere et score les offres 976")
    sub_scan.add_argument("--dept", default=DEPT)
    sub_scan.add_argument("--rome", nargs="?", const="tech", default=None,
                          help="tech (defaut) ou liste ROME personnalisee")
    sub_scan.add_argument("--min", type=int, default=8)
    sub_scan.set_defaults(f=cmd_scan)

    sub_prep = subcmds.add_parser("prep", help="Genere les brouillons")
    sub_prep.add_argument("--min", type=int, default=8)
    sub_prep.add_argument("--max", type=int, default=25, help="max offres a traiter")
    sub_prep.add_argument("--no-ia", action="store_true", help="utilise le modele simple")
    sub_prep.add_argument("--mobile", action="store_true", help="force mode mobile")
    sub_prep.add_argument("--eml", action="store_true", help="force mode .eml")
    sub_prep.set_defaults(f=cmd_prep)

    sub_envoyer = subcmds.add_parser("envoyer", help="Envoie un brouillon (mobile)")
    sub_envoyer.set_defaults(f=cmd_envoyer)

    sub_list = subcmds.add_parser("list", help="Historique")
    sub_list.add_argument("--statut", choices=["nouveau", "prepare", "envoye", "ignore"],
                          help="filtrer par statut")
    sub_list.set_defaults(f=cmd_list)

    sub_ignore = subcmds.add_parser("ignore", help="Marquer une offre comme ignoree")
    sub_ignore.add_argument("id")
    sub_ignore.set_defaults(f=cmd_ignore)

    a = parser.parse_args()
    a.f(a)


if __name__ == "__main__":
    main()
