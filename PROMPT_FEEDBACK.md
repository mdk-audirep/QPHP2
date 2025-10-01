# Feedback sur le prompt QuestionnaireMasterPIE

## Clarté générale
- Le brief couvre intégralement les objectifs produit (reconstruction complète, protocole d'appels API, contraintes front) et reste cohérent.
- La séparation en sections SYSTÈME, protocole de génération séquentielle et addendum technique facilite la compréhension globale.

## Points forts
1. **Flux opérationnel détaillé** : les étapes Collecte → Plan → Sections → Assemblage sont décrites avec conditions de passage claires.
2. **Spécifications API illustrées** : les exemples `/start`, `/continue` et `/final` réduisent l'ambiguïté sur les métadonnées attendues.
3. **Exigences UX explicites** : boutons, raccourcis, cases à cocher hiérarchiques et stockage du Markdown final sont bien listés.

## Points d'amélioration suggérés
- Documenter le format exact de `memory_delta` (diff vs. snapshot complet) pour éviter les interprétations divergentes côté backend.
- Préciser le comportement attendu lorsque `prompt_version` est obsolète (code d'erreur, message utilisateur, nécessité d'un nouveau `/start`).
- Ajouter un rappel succinct sur la détection front de la phase `final` pour remplir `#finalMarkdown`, par exemple via un champ `final_markdown_present` ou un flag similaire.

## Recommandations pratiques
- Fournir un tableau récapitulatif des étapes avec champs obligatoires/facultatifs afin de servir de checklist QA rapide.
- Mentionner explicitement la méthode de compression (structure du résumé sémantique) pour guider l'implémentation serveur.

## Conclusion
Le prompt est exploitable en l'état pour lancer le développement. Les ajouts proposés visent uniquement à lever les dernières zones d'incertitude techniques et à sécuriser les implémentations futures.
