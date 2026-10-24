# DBR Connect

Mini-application web (Netlify) qui relie le compte Instagram professionnel à DBR : connexion Instagram, profil, publications, commentaires avec le mot-clé, envoi du guide en réponse privée, messages et vérification de l'abonnement. Sert à l'examen de l'app par Meta (accès avancé `instagram_business_manage_comments` et `instagram_business_manage_messages`).

- Site Netlify : base `connect/`, publication `public/`, fonctions `netlify/functions/`.
- Variable d'environnement obligatoire (Netlify) : `IG_APP_SECRET` (clé secrète Instagram de l'app Meta). Jamais dans le dépôt.
- URL de redirection à déclarer dans Meta : `https://<site>/api/callback`.
