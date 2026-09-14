# Veille Mayotte : Surveillance des offres d'emploi (département 976)

Script Python en ligne de commande qui surveille les offres d'emploi de Mayotte via l'API officielle **France Travail « Offres d'emploi v2 »**. Les offres sont stockées localement, scorées contre votre profil, et des brouillons de candidature sont générés pour votre relecture avant envoi.

**Plateforme testée** : Termux sur Android (Python 3, bibliothèque standard uniquement).

---

## Prérequis

### 1. Obtenir les identifiants France Travail

1. Allez sur [francetravail.io](https://francetravail.io)
2. Connectez-vous ou créez un compte
3. Accédez à **Mes ressources** → **Créer une nouvelle application**
4. Remplissez le formulaire :
   - **Nom** : `veille-mayotte` (ou au choix)
   - **URL de votre site** : `https://github.com/Dupk80/veille-mayotte`
   - Acceptez les CGU
5. Notez l'**ID client** et le **Secret client** (sauvegardez dans un endroit sûr)
6. Souscrivez à l'API **« Offres d'emploi v2 »** (depuis votre tableau de bord)

### 2. Exporter les variables d'environnement

```bash
export FT_CLIENT_ID="votre_id_client"
export FT_CLIENT_SECRET="votre_secret_client"
```

**Conseil Termux** : Ajoutez ces deux lignes à `~/.bashrc` pour ne pas les taper à chaque session.

### 3. Installation sous Termux

```bash
pkg update
pkg install python termux-api git
termux-setup-storage  # Permet l'accès à /storage/shared/Download
```

### 4. Préparer votre profil

Lancez une première fois :

```bash
python3 veille_mayotte.py init
```

Cela crée `profil.json` avec un exemple. Éditez-le pour ajouter vos informations personnelles, cv, mots-clés de scoring, et exclusions.

---

## Utilisation

### Initialiser le profil

```bash
python3 veille_mayotte.py init
```

Génère `profil.json` avec les champs à compléter :
- `candidat` : nom, email, téléphone
- `pitch` : texte de présentation réutilisable
- `cv` : nom du fichier PDF (ex : `cv.pdf`)
- `mots_cles` : dictionnaire `{mot: poids}` (poids entiers > 0)
- `exclusions` : liste de termes disqualifiants (ex : `["CDI court terme", "télétravail"]`)

### Scanner les offres

```bash
python3 veille_mayotte.py scan [--dept 976] [--rome tech] [--min 10]
```

- `--dept 976` : département (défaut 976)
- `--rome tech` : raccourci pour codes ROME techniciens informatique (défaut) ou liste complète : `I1401,I1404,M1810,H1101,M1801`
- `--min 10` : affiche les offres avec un score ≥ 10

Résultat : les offres sont insérées dans `offres976.db`, dédoublonnées par id, et affichées triées par score décroissant.

### Préparer les brouillons

```bash
python3 veille_mayotte.py prep [--min 10] [--max 30] [--no-ia] [--mobile] [--eml]
```

- `--min 10` : traite les offres avec un score ≥ 10
- `--max 30` : traite au maximum 30 offres
- `--no-ia` : utilise un modèle simple au lieu d'appeler Claude Sonnet
- `--mobile` : génère des fichiers `.txt` lisibles dans `~/storage/shared/Download/candidatures976/` (détection automatique sous Termux)
- `--eml` : force le format `.eml` (mode desktop)

Les brouillons sont crées avec le statut `prepare` et contiennent la lettre de motivation + CV en pièce jointe.

### Envoyer les candidatures (mode mobile)

```bash
python3 veille_mayotte.py envoyer
```

Affiche **une offre à la fois** :
- Récapitulatif complet (poste, entreprise, lieu, salaire, contrat, email, URL)
- Lettre de motivation générée
- Choix : `o` (envoyer et copier la lettre au presse-papiers), `i` (ignorer définitivement), `p` (plus tard)

Si vous validez `o`, le script :
1. Copie la lettre au presse-papiers (via `termux-clipboard-set`)
2. Ouvre le client mail par défaut avec une URL `mailto:` précomplétée
3. Marque l'offre comme `envoye`

### Lister l'historique

```bash
python3 veille_mayotte.py list [--statut nouveau] [--statut prepare]
```

Affiche toutes les offres avec leur statut : `nouveau`, `prepare`, `envoye`, `ignore`.

### Ignorer une offre

```bash
python3 veille_mayotte.py ignore <id_offre>
```

Marque l'offre comme `ignore`, elle ne réapparaîtra plus.

---

## Scoring

Chaque offre est scorée ainsi :

1. Pour chaque mot-clé (insensible aux accents et à la casse) :
   - Trouvé dans l'intitulé → +`poids` × 2
   - Trouvé dans l'entreprise ou la description → +`poids`
2. Chaque terme d'`exclusions` trouvé → −12 points
3. Bonus : +2 points si l'offre a un email de contact

Exemple : si votre `profil.json` contient `"python": 5`, une offre intitulée « Développeur Python » vous rapporte +10 points.

---

## Lettres de motivation

Deux modes :

- **Mode modèle** (par défaut) : complète un texte à trous avec votre profil depuis `profil.json`
- **Mode IA** (si `ANTHROPIC_API_KEY` est défini) : envoie votre profil + l'offre à Claude Sonnet 5 pour générer une lettre personnalisée

En cas d'absence de clé ou d'erreur API, le script revient silencieusement au mode modèle.

---

## Fichiers sensibles (toujours en `.gitignore`)

```
profil.json           # Données personnelles
cv.pdf                # Votre CV
*.pdf                 # Tout fichier PDF local
offres976.db          # Base locale avec historique
brouillons/           # Brouillons générés
candidatures976/      # Répertoire Termux (mobile)
__pycache__/          # Pycache Python
*.eml                 # Brouillons email
```

**Ne commitez jamais ces fichiers.**

---

## Détection automatique de l'environnement

Le script détecte si vous êtes sur Termux et ajuste la sortie :
- **Termux détecté** (variable `$PREFIX` ou existence de `~/storage/shared`) → mode mobile (`.txt` + CV copiés)
- **Desktop** → mode email (`.eml` ouvrable comme brouillon)

Vous pouvez forcer avec `--mobile` ou `--eml`.

---

## Notes d'utilisation

- **Ne poussez jamais** `profil.json`, `cv.pdf`, ou `offres976.db` sur GitHub.
- **Les offres dédoublonnées** : une offre vue une fois ne réapparaît jamais, même après relance du scan.
- **Pas de candidature automatique** : vous relisez et validez avant envoi.
- **Gestion des limites API** : le script respecte la limite de 10 appels/sec et réessaie en cas de 429.
- **Pagination** : jusqu'à 1149 offres maximum (limite France Travail).

---

## Support

Consultez les messages d'erreur du script — ils sont explicites sur les causes (clés manquantes, API non souscrite, CV introuvable, etc.).

Bon succès dans vos candidatures ! 🎯
