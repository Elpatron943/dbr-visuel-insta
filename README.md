# DBR — carrousels Instagram

Carrousels Instagram de Daily Business Review, préparés par Nora (agent studio) et publiés **uniquement après validation du fondateur**.

- `instagram/<slug>/` : 2 à 10 images JPEG 1080 × 1350 + `post.json` (légende, date, `approved`).
- `instagram/<slug>/` pour un réel : `reel.mp4` (vertical 9:16) + `post.json` avec `"type": "reel"` et `"video": "reel.mp4"` (réels quotidiens d'Aryana, depuis le 23 oct. 2026).
- L'action « Publier les carrousels et réels Instagram validés » passe toutes les 15 minutes et publie un carrousel quand `approved` vaut `true` et que sa date est arrivée. Elle ajoute `published.json` (lien du post).
- Un carrousel validé plus de 7 jours après sa date n'est pas publié (`skipped.json`) : il faut le replanifier.
- Secrets (environnement GitHub « Instagram » ou dépôt) : `IG_ACCESS_TOKEN`, `IG_USER_ID`. Le jeton est prolongé le 1er et le 15 de chaque mois.

Dépôt public : uniquement des visuels destinés à être publiés, jamais de jeton ni de donnée privée.
