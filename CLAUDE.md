# DBR Visuel Insta

Dépôt public des carrousels et réels Instagram de Daily Business Review (compte @aryanadbr). Les contenus sont préparés par Nora (agent studio), validés par le fondateur, puis publiés par des actions GitHub. Le dépôt contient aussi les statistiques, le suivi « Commente le mot », deux outils vidéo Python et DBR Connect (fonctions Netlify).

## Structure
- `instagram/<dossier>/` : un contenu par dossier (`post.json`, médias, puis `published.json` ou `skipped.json`).
- `scripts/` : `story-instagram.mjs`, `publish-instagram.mjs`, `reply-keyword.mjs`, `refresh-token.mjs`, `check-connection.mjs`, `instagram-stats.mjs`.
- `.github/workflows/` : une action par script, plus `sync-supabase.yml`. Les fichiers `.github/*-trigger` servent à relancer une action par un push sur main.
- `engagement/` (état et compteurs du mot-clé), `stats/` (relevés quotidiens), `guides/<slug>/cover.png`.
- `stories/` (une story par jour, images 9:16 des carrousels dans `frames/`), `tools/story/frame.py` (carrousel vers 9:16).
- `tools/couverture/couverture.py` (image de couverture d'un réel), `tools/habillage/habiller.py` (sous-titres, zooms, accroche).
- `connect/` : application Netlify (`public/`, `netlify/functions/`), voir `connect/README.md`.

## Format de post.json
- Carrousel : `publish_at` (ISO UTC), `approved` (booléen), `caption`, `images` (2 à 10 JPEG 1080 x 1350), `approval_id`.
- Réel : `"type": "reel"`, `video` (`reel.mp4`, vertical 9:16), `cover` (`cover.jpg`, optionnel), `caption`, `publish_at`, `approved`, `approval_id`.
- « Commente le mot » (réels) : `keyword`, `guide_title`, `guide_url`.
- Légende : 2 200 caractères et 30 hashtags au plus (le script refuse sinon).

## Actions (toutes dans l'environnement GitHub « Instagram »)
- Publication : toutes les 15 minutes et à chaque push sur un `post.json`. Une seule publication par passage. Publie si `approved` vaut `true` et si `publish_at` est passé. Au-delà de 7 jours de retard : `skipped.json`, à replanifier.
- Synchronisation Supabase : toutes les 10 minutes, recopie les réels de Nora dans `instagram/` puis lance la publication. Elle réécrit `post.json` tant que le dossier n'a ni `published.json` ni `skipped.json`.
- Mot-clé : toutes les 10 minutes (`reply-keyword.yml`), option « Essai à blanc » en lancement manuel. Voir le README pour le déroulé.
- Statistiques : chaque jour à 05:17 UTC, dans `stats/`. Prolongation du jeton : le 1er et le 15 de chaque mois. Vérification de la connexion : manuelle ou par push sur `.github/check-trigger`.
- Story du jour : `story-instagram.yml`, chaque jour à 16 h 40 UTC (rattrapages à 17 h 40, 18 h 40, 19 h 40 et 20 h 40 UTC si GitHub saute le passage, sans doublon), republie en story un contenu déjà publié (réel tel quel, carrousel converti en image 9:16 par `tools/story/frame.py`), rotation du moins récemment utilisé, une par jour. Choix tracé dans `stories/<date>/story.json`, publication dans `published.json`. Annuler un jour : `stories/<date>/skipped.json` ; tout arrêter : fichier `stories/PAUSE` ; exclure un contenu : `"no_story": true` dans son `post.json`. Lancement manuel en essai à blanc (par défaut).
- Secrets : `IG_ACCESS_TOKEN`, `IG_USER_ID`. Netlify : `IG_APP_SECRET`. Variable optionnelle : `SUPABASE_PUBLISHABLE_KEY`.

## Annuler ou suspendre
- Avant publication : mettre `approved` à `false`. Pour un réel de Nora, le faire aussi côté Supabase, sinon la synchronisation remet la valeur.
- Écarter définitivement un dossier : y ajouter un `skipped.json` (la synchronisation n'y touche plus).
- Tout suspendre : désactiver l'action « Publier les carrousels et réels Instagram validés » et la synchronisation dans l'onglet Actions de GitHub.
- Après publication, `published.json` empêche toute republication ; la suppression du post se fait à la main dans Instagram.

## Règles
- Un contenu DBR est publié sur trois réseaux : Instagram @aryanadbr, X @Aryanadbr et LinkedIn. Jamais sur Instagram seul.
- Pas de tiret long ni de demi-cadratin, pas de flèche, pas d'emoji. Écrire « pipeline », jamais « pipe ».
- Rien n'est publié sans `approved: true` posé par le fondateur.
- Dépôt public : aucun secret, aucune valeur de jeton, aucun nom ni texte de commentaire. Seuls des noms de variables et des compteurs ou empreintes. Les scripts n'écrivent jamais le jeton dans les journaux.
- Ne jamais lancer une action de publication ni appeler l'API Instagram pour un essai.

## Contrôles disponibles (aucun test automatisé)
- `node --check scripts/*.mjs connect/netlify/functions/*.mjs`
- `python3 -m py_compile tools/couverture/couverture.py tools/habillage/habiller.py`
- Validité JSON des `post.json` et des fichiers YAML des workflows.
