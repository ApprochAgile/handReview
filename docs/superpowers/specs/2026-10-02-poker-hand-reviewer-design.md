# Poker Hand Reviewer — Design (V1)

Date : 2026-10-02
Statut : validé en brainstorming, en attente de relecture

## 1. Objectif

Une application web de review de mains de poker pour un **groupe privé**. Une main est rejouée sur une table visuelle ; à certains points de décision choisis par l'auteur de la main, chaque participant vote **sur son propre appareil** parmi des options libres. L'organisateur révèle ensuite la répartition des votes (pourcentages) puis la main continue avec l'action réellement jouée.

Contraintes :
- Gratuit, **aucun serveur à gérer, aucune base de données**, aucun compte.
- Rien n'est conservé : les votes n'existent que pendant la session.
- Interface en français.

Hors périmètre V1 : historique des votes, comptes, commentaires, side pots détaillés, calcul du gagnant, import d'historiques de room, lien avec `../Ranges_MC`.

## 2. Architecture

- Page web statique unique (`index.html` + CSS + JS en modules ES), sans framework ni build.
- Seule dépendance : **PeerJS** (version épinglée, chargée depuis un CDN) pour la communication pair-à-pair WebRTC, via le serveur de mise en relation public gratuit de PeerJS.
- Hébergement : tout hébergeur statique (GitHub Pages, Netlify). En local : `npx serve` (les modules ES ne fonctionnent pas en `file://`).
- Thème visuel repris de `../index.html` (tapis vert / or).

Trois rôles, éventuellement tenus par des personnes différentes :

| Rôle | Fait quoi |
|---|---|
| **Éditeur** | Crée la main sur la table, pose les points de vote, exporte un fichier `.json`. |
| **Hôte** | Importe le `.json`, ouvre une session, partage le lien, pilote les étapes. Peut aussi voter. |
| **Votant** | Ouvre le lien, saisit un pseudo, vote. |

L'éditeur transmet le fichier JSON à l'hôte par ses propres moyens (Discord, mail…). L'hôte envoie la main aux votants via PeerJS ; les votants n'importent rien.

## 3. Format de la main (JSON)

```json
{
  "version": 1,
  "title": "BTN open 15bb, BB jam",
  "setup": {
    "players": 3,
    "seats": [
      { "name": "Hero",     "position": "BTN", "stack": 15, "cards": "AhJd", "hero": true },
      { "name": "Vilain 1", "position": "SB",  "stack": 22, "cards": null },
      { "name": "Vilain 2", "position": "BB",  "stack": 13, "cards": "QsQc" }
    ]
  },
  "board": { "flop": "Kc7h2s", "turn": "9d", "river": "4c" },
  "actions": [
    { "seat": 0, "type": "raise", "amount": 2,
      "vote": { "question": "Que fais-tu ?", "options": ["Fold", "Limp", "Raise 2bb", "All-in"] } },
    { "seat": 1, "type": "fold" },
    { "seat": 2, "type": "allin" },
    { "seat": 0, "type": "call",
      "vote": { "question": "", "options": ["Fold", "Call"] } }
  ]
}
```

### 3.1 Setup
- `players` : 2 à 9.
- Blinds fixes **SB 0,5 / BB 1**. Pas d'ante, pas de straddle. Tous les montants et stacks sont **en BB** (nombres décimaux autorisés, ex. 12.5).
- `seats` est ordonné selon l'ordre des positions ci-dessous ; `seat` dans les actions est l'index dans ce tableau. Les positions sont **attribuées automatiquement** selon le nombre de joueurs :

| Joueurs | Positions (ordre des sièges) |
|---|---|
| 2 | BTN (= SB), BB |
| 3 | BTN, SB, BB |
| 4 | CO, BTN, SB, BB |
| 5 | HJ, CO, BTN, SB, BB |
| 6 | LJ, HJ, CO, BTN, SB, BB |
| 7 | UTG, LJ, HJ, CO, BTN, SB, BB |
| 8 | UTG, UTG+1, LJ, HJ, CO, BTN, SB, BB |
| 9 | UTG, UTG+1, UTG+2, LJ, HJ, CO, BTN, SB, BB |

- Exactement un siège a `hero: true`. Les cartes du héros sont obligatoires.
- Les cartes des vilains sont **facultatives** (`null` si non saisies).
- Cartes : notation texte `RangCouleur` concaténée, rangs `AKQJT98765432`, couleurs `shdc` (ex. `AhJd`, `Kc7h2s`). Aucune carte en double dans toute la main (sièges + board).

### 3.2 Actions
- Séquence réelle de la main, dans l'ordre de parole.
- `type` ∈ `fold`, `check`, `call`, `bet`, `raise`, `allin`.
- `amount` uniquement pour `bet` et `raise` : **montant total misé sur la street** (« raise to »). Pour `call` et `allin`, le montant est calculé par le moteur.
- `vote` (facultatif) : « avant de montrer cette action, faire voter ». `question` texte libre (peut être vide), `options` liste de 2 à 6 chaînes non vides, écrites librement par l'éditeur. Un vote peut être posé sur l'action de n'importe quel joueur.

### 3.3 Board
- `flop` (3 cartes), `turn` (1), `river` (1), chacun `null` si la street n'est pas atteinte.
- Une street est « atteinte » quand le tour d'enchères précédent est clos avec au moins 2 joueurs non couchés. Si tous les joueurs restants (sauf au plus un) sont à tapis, les streets restantes sont distribuées d'un coup à la fin des actions ; le board doit alors être complet.

## 4. Moteur de main (`engine.js`)

Fonction pure : `computeState(setup, actions, n)` → état de la table après les `n` premières actions. L'état contient : stacks restants, mises de la street par siège, pot (total des streets précédentes), street courante, board visible, joueurs couchés / à tapis, siège qui doit parler (ou aucun si la main est finie), dernière action de chaque siège (pour l'affichage « Raise 2 », « Fold »…), actions légales avec montants min/max, indicateur `handOver`.

Règles :
- Préflop : SB et BB postent (un stack inférieur à la blind poste tout et est à tapis). Le premier à parler est le siège suivant la BB ; en heads-up, le BTN/SB parle en premier préflop et en dernier postflop.
- Postflop : le premier joueur actif à partir de la SB parle en premier.
- Un tour d'enchères est clos quand tous les joueurs actifs non à tapis ont parlé depuis la dernière relance et égalisé la mise la plus haute.
- `check` légal si aucune mise à égaliser ; `call` sinon (limité au stack restant, un call de tout le stack est un all-in) ; `bet` si aucune mise sur la street ; `raise` si une mise existe.
- Mise / relance minimum : bet ≥ 1 BB ; raise to ≥ mise courante + dernier incrément de relance (incrément initial préflop = 1 BB). Maximum : le stack (au-delà, c'est `allin`).
- Simplification V1 : un all-in inférieur à une relance minimum ne rouvre pas formellement les enchères, mais le moteur ne l'empêche pas non plus (un joueur ayant déjà parlé peut relancer). Pas de side pots : un seul pot affiché.
- La main est finie quand il ne reste qu'un joueur non couché, ou après la clôture du tour de river, ou quand plus aucune action n'est possible (tapis).

## 5. Écrans

Une seule page, écran d'accueil avec trois choix : **Créer une main**, **Héberger une session**, **Rejoindre**. Un lien `#join=<peerId>` ouvre directement l'écran votant.

### 5.1 Éditeur
- **Setup** : boutons nombre de joueurs (2 à 9) ; pour chaque siège : nom, stack (BB), case « Hero » (un seul) ; cartes via le sélecteur (cartes du héros obligatoires, des vilains facultatives). Titre de la main.
- **Sélecteur de cartes** (modale) : grille A→2 + 4 boutons de couleur ; les cartes déjà utilisées sont grisées.
- **Actions** : table ovale avec sièges, stacks, cartes (héros visible, vilains au dos avec un indicateur « cartes saisies »), mises devant chaque joueur, pot au centre, board ; le siège qui doit parler est surligné. En bas : uniquement les boutons d'actions légales, avec un champ montant (min/max affichés) pour Bet/Raise.
- Fin de street : demande des cartes du board via le sélecteur avant de continuer.
- **Point de vote** : case « Faire voter ici » avant de valider l'action du joueur qui parle ; champ question facultatif ; options une par ligne, pré-remplies avec les actions légales (ex. « Fold », « Call 2 », « Raise », « All-in »), modifiables librement.
- **Annuler la dernière action**, **Exporter JSON** (nom de fichier dérivé du titre), **Importer JSON** (pour reprendre une main).
- Le brouillon est sauvegardé automatiquement dans le `localStorage` (accès protégé par try/catch).

### 5.2 Hôte
- Importe un JSON (validé, voir §7), puis **Ouvrir la session** : crée un peer PeerJS à identifiant aléatoire et affiche le lien de partage (bouton Copier) et la liste des pseudos connectés.
- Table en lecture seule, identique à celle des votants.
- Pilotage :
  - **Démarrer** : les actions jusqu'au premier point de vote sont rejouées une par une (délai ~700 ms) puis le vote s'ouvre.
  - Pendant un vote : compteur « 3/5 ont voté », bouton **Révéler**.
  - Après révélation : bouton **Suivant** : joue l'action réelle, puis rejoue jusqu'au prochain point de vote ou jusqu'à la fin.
  - À la fin de la main : les cartes des vilains saisies sont retournées.
- L'hôte saisit aussi un pseudo et peut voter comme les autres.

### 5.3 Votant
- Saisie du pseudo (mémorisé dans le `sessionStorage`), puis table synchronisée avec l'hôte.
- Au point de vote : question + options en gros boutons. Le choix envoyé reste surligné et peut être **changé jusqu'à la révélation**.
- Après révélation : sur chaque option, barre de remplissage + « 42 % (3) », le choix du votant reste mis en évidence, total « 5 votes ».
- Les votants ne voient jamais quelle option correspond à l'action réelle autrement qu'en voyant l'action se jouer ensuite.

### 5.4 Responsive
La table et les boutons de vote doivent rester lisibles sur mobile (≥ 360 px de large), sans défilement horizontal.

## 6. Communication (PeerJS)

L'hôte est l'unique source de vérité ; les votants ne font qu'afficher.

| Sens | Message | Contenu |
|---|---|---|
| Votant → Hôte | `join` | `{ name }` |
| Hôte → Votant | `state` | état complet de la session |
| Votant → Hôte | `vote` | `{ option: index }` |

Message `state` : main **sans les cartes des vilains** (ajoutées seulement en phase `finished`), index de l'action courante, phase (`lobby` / `replay` / `voting` / `revealed` / `finished`), liste des pseudos connectés, nombre de votes reçus, vote du destinataire, résultats (uniquement en phase `revealed`).

- L'hôte renvoie l'état complet à chaque votant après chaque changement (pas de messages incrémentaux).
- Votes indexés par pseudo : un nouveau vote remplace le précédent.
- Pseudo déjà utilisé par une connexion **active** → suffixe automatique (« Max (2) »). Pseudo d'une connexion **fermée** → repris par le nouvel arrivant (reconnexion), avec son vote.
- Pourcentages calculés sur les votes exprimés, arrondis à l'entier par la méthode du plus fort reste (somme = 100 %). Aucun vote → 0 % partout, « 0 vote ».

## 7. Gestion des erreurs

- **Votant déconnecté** : reconnexion automatique (quelques essais espacés), même pseudo, récupère l'état et son vote.
- **Votant arrivé en cours** : reçoit l'état courant, peut voter si un vote est ouvert.
- **Hôte déconnecté / onglet fermé** : les votants voient « Session terminée — hôte déconnecté ». Un rechargement côté hôte impose de rouvrir une session (nouveau lien).
- **Serveur PeerJS injoignable** : message explicite + bouton Réessayer.
- **Lien invalide / hôte introuvable** : message « Session introuvable ».
- **JSON invalide** : validation (version, 2–9 joueurs, un seul héros avec cartes, cartes valides et sans doublon, stacks > 0, chaque action légale selon le moteur, board cohérent avec les streets atteintes, options de vote valides) ; message d'erreur indiquant le premier problème.

## 8. Organisation du code

```
reviewer/
  index.html          page unique, routage des écrans
  css/style.css       thème, table, responsive
  js/
    engine.js         moteur de main (pur)
    hand-format.js    validation, import/export, retrait des cartes vilains (pur)
    votes.js          décompte et pourcentages (pur)
    cards.js          parsing des cartes, cartes utilisées (pur)
    positions.js      table des positions par nombre de joueurs (pur)
    table-view.js     rendu de la table
    card-picker.js    sélecteur de cartes
    editor.js         écran éditeur
    host.js           écran hôte + logique de session
    voter.js          écran votant
    net.js            couche PeerJS (connexion, envoi, reconnexion)
  tests/              tests node:test des modules purs
```

## 9. Tests

- `node --test` (Node 22, aucune dépendance) sur les modules purs :
  - **engine** : ordre de parole pour 2, 3, 6 et 9 joueurs ; blinds (y compris stack < blind) ; pot ; clôture des streets ; all-in et stacks partiels ; joueurs couchés ; actions légales et min/max ; fin de main.
  - **hand-format** : JSON valides/invalides, doublons de cartes, retrait des cartes des vilains.
  - **votes** : pourcentages, remplacement de vote, aucun vote, arrondi à 100 %.
  - **cards** / **positions** : parsing, tables de positions.
- Vérification manuelle : session avec un onglet hôte et deux onglets votants (vote, changement de vote, révélation, suivant, déconnexion/reconnexion, fin de main avec retournement des cartes) ; affichage en largeur mobile.
