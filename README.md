# DBR — carrousels Instagram

Carrousels Instagram de Daily Business Review, préparés par Nora (agent studio) et publiés **uniquement après validation du fondateur**.

- `instagram/<slug>/` : 2 à 10 images JPEG 1080 × 1350 + `post.json` (légende, date, `approved`).
- `instagram/<slug>/` pour un réel : `reel.mp4` (vertical 9:16) + `post.json` avec `"type": "reel"` et `"video": "reel.mp4"` (réels quotidiens d'Aryana, depuis le 23 oct. 2026).
- L'action « Publier les carrousels et réels Instagram validés » passe toutes les 15 minutes et publie un carrousel quand `approved` vaut `true` et que sa date est arrivée. Elle ajoute `published.json` (lien du post).
- Un carrousel validé plus de 7 jours après sa date n'est pas publié (`skipped.json`) : il faut le replanifier.
- Secrets (environnement GitHub « Instagram » ou dépôt) : `IG_ACCESS_TOKEN`, `IG_USER_ID`. Le jeton est prolongé le 1er et le 15 de chaque mois.

Dépôt public : uniquement des visuels destinés à être publiés, jamais de jeton ni de donnée privée.

## « Commente le mot » : envoi automatique du guide (depuis le 24 oct. 2026)
- Chaque réel se termine par « Commente <MOT>, je t'envoie le guide complet ». Nora ajoute dans `post.json` : `"keyword"`, `"guide_title"`, `"guide_url"` (guide du sujet sur daily-business-review.com/blog/guide-…).
- L'action « Envoyer le guide aux commentaires avec le mot-clé » passe toutes les 10 minutes : pour chaque commentaire contenant le mot (accents et majuscules indifférents) sous un contenu publié depuis moins de 7 jours, elle envoie **une réponse privée** avec le lien du guide (une seule par personne et par contenu), puis une courte réponse publique « C'est parti en message privé 📩 ».
- Droits du jeton requis : `instagram_business_manage_comments` et `instagram_business_manage_messages` ; dans l'app Instagram, « Autoriser l'accès aux messages » activé. État dans `engagement/status.json`.
- Le dépôt étant public, seuls des compteurs (`engagement/stats.json`) et des empreintes de commentaires (`engagement/handled.json`) sont enregistrés : aucun nom, aucun texte de commentaire.
- Essai à blanc : lancer l'action à la main avec « Essai à blanc » coché.
