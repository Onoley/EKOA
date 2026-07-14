# Revue d’accessibilité

Référence visée : WCAG 2.2 AA et RGAA applicable. Le contrôle mobile vérifie repères, libellé e-mail, commande et focus clavier. Le focus est visible, les cibles principales font au moins 44 px et `prefers-reduced-motion` neutralise les animations.

Avant lancement, une revue humaine doit couvrir chaque parcours : ordre/pièges de focus, zoom 200/400 %, VoiceOver Safari et NVDA/Firefox, annonces d’erreur/succès, contrastes, orientation et clavier seul. Le test automatisé actuel n’est pas un audit RGAA complet.

Le fil mobile immersif conserve des cibles d’au moins 44 px, un rail d’actions libellé, des états `aria-pressed`, une navigation active annoncée et un défilement vertical natif. Les commentaires s’ouvrent dans un élément `dialog` modal natif : le focus est contenu par le navigateur, Échap ferme le panneau et le focus revient sur le bouton déclencheur. Une validation humaine sur petits écrans (320 px de large et faible hauteur), clavier virtuel, VoiceOver et TalkBack reste requise.
