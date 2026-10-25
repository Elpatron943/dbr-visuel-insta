# DBR | carrousels Instagram

Carrousels Instagram de Daily Business Review, préparés par Nora (agent studio) et publiés **uniquement après validation du fondateur**.

- `instagram/<slug>/` : 2 à 10 images JPEG 1080 × 1350 + `post.json` (légende, date, `approved`).
- `instagram/<slug>/` pour un réel : `reel.mp4` (vertical 9:16) + `post.json` avec `"type": "reel"` et `"video": "reel.mp4"` (réels quotidiens d'Aryana, depuis le 23 oct. 2026).
- L'action « Publier les carrousels et réels Instagram validés » passe toutes les 15 minutes et publie un carrousel quand `approved` vaut `true` et que sa date est arrivée. Elle ajoute `published.json` (lien du post).
- Un carrousel validé plus de 7 jours après sa date n'est pas publié (`skipped.json`) : il faut le replanifier.
- Secrets (environnement GitHub « Instagram » ou dépôt) : `IG_ACCESS_TOKEN`, `IG_USER_ID`. Le jeton est prolongé le 1er et le 15 de chaque mois.

Dépôt public : uniquement des visuels destinés à être publiés, jamais de jeton ni de donnée privée.

## « Commente le mot » : envoi automatique du guide aux abonnés (depuis le 24 oct. 2026)
- Chaque réel se termine par « Commente <MOT>, je t'envoie le guide complet » (carton final : `habiller.py --keyword <MOT>`). Nora ajoute dans `post.json` : `"keyword"`, `"guide_title"`, `"guide_url"`.
- L'action « Envoyer le guide aux commentaires avec le mot-clé » passe toutes les 10 minutes :
  1. commentaire contenant le mot (accents et majuscules indifférents), contenu publié depuis moins de 7 jours → réponse privée « réservé aux abonnés : abonne-toi puis réponds GUIDE » + courte réponse publique ;
  2. la personne répond → vérification de l'abonnement (`is_user_follow_business`) → abonnée : lien du guide ; pas encore : un rappel (2 au plus).
- Droits du jeton requis : `instagram_business_manage_comments` et `instagram_business_manage_messages` ; dans l'app Instagram, « Autoriser l'accès aux messages » activé. État dans `engagement/status.json`, compteurs dans `engagement/stats.json`.
- Dépôt public : seuls des compteurs et des empreintes (`engagement/handled.json`) sont enregistrés, aucun nom ni texte.
- Essai à blanc : lancer l'action à la main avec « Essai à blanc » coché.

## Couverture des réels (depuis le 24 oct. 2026)
- `tools/couverture/couverture.py reel.mp4 cover.jpg --at <s> --text "Ligne 1|Ligne 2" --gold <mot> --tag "<sujet>" --format A|B|C` : image 1080 × 1920 tirée de la vidéo, texte court très visible, étiquette du sujet colorée selon le format, tout dans la zone visible de la grille (3:4).
- `post.json` : `"cover": "cover.jpg"` ; l'action de publication l'envoie comme couverture du réel (`cover_url`).

## Republication à l'identique (depuis le 24 oct. 2026)
- L'action « Programmer les republications Instagram » (`.github/workflows/republish-instagram.yml`, `scripts/republish-instagram.mjs`) passe le **mardi et le vendredi** et programme la republication d'un carrousel ou d'un réel déjà publié depuis au moins **28 jours**, le **jeudi ou le dimanche suivant à 20 h 15** (heure de Paris), au moins 48 h plus tard.
- Elle crée seulement `instagram/<dossier>-repub-<date>/post.json` (`"republication_of": "<dossier d'origine>"`, `"approved": true`) ; les vidéos, couvertures et images ne sont **pas copiées** : `scripts/publish-instagram.mjs` les lit dans le dossier d'origine et publie à l'heure prévue. Légende, mot-clé « Commente le mot » et guide sont ceux de l'original.
- Choix : le contenu le plus vu d'après `stats/instagram-latest.json`, à défaut le plus ancien ; une même source ne repasse pas avant 90 jours ; au plus 2 republications par semaine.
- **Annuler** une republication programmée : mettre `"approved": false` dans son `post.json`, ou supprimer son dossier. **Tout arrêter** : créer le fichier `republication/PAUSE` (ou désactiver l'action). Exclure un contenu : `"no_republish": true` dans son `post.json`.
- Essai à blanc : lancer l'action à la main (« Essai à blanc » coché par défaut, `min_age_days` modifiable).
