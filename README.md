# Poker Hand Reviewer

Review de mains de poker en groupe : un éditeur saisit une main et ses points de vote,
un hôte la rejoue en direct, chaque participant vote sur son appareil et l'hôte révèle les pourcentages.

## Lancer en local

```bash
npx --yes serve -l 5173
```

Puis ouvrir http://localhost:5173. (Les modules ES ne fonctionnent pas en ouvrant
`index.html` par double-clic.)

## Tests

```bash
npm test
```

Node 22+, aucune dépendance à installer.

## Utilisation

1. **Créer une main** : setup (joueurs, stacks en BB, cartes), puis actions sur la table.
   Cocher « Faire voter ici » avant une action pour en faire un point de vote. Exporter le JSON.
2. **Héberger une session** : importer le JSON, ouvrir la session, partager le lien.
   Démarrer, Révéler, Suivant. Garder l'onglet ouvert pendant toute la session, et au premier
   plan pendant la lecture (le navigateur ralentit les onglets en arrière-plan).
3. **Rejoindre** : ouvrir le lien, choisir un pseudo, voter.

## Déployer (gratuit)

Le dossier est un site statique : GitHub Pages (Settings → Pages → branche `master`, dossier racine)
ou Netlify (glisser-déposer le dossier). La mise en relation passe par le serveur public gratuit de PeerJS ;
les votes transitent directement entre navigateurs et ne sont stockés nulle part.
