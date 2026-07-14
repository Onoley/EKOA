export const TAXONOMY_VERSION = 1;

export const universes = [
  {slug:"societe-politique-monde",name:"Société, politique & monde",description:"Comprendre la société, les institutions et les grands enjeux du monde.",iconKey:"landmark"},
  {slug:"travail-argent-vie-materielle",name:"Travail, argent & vie matérielle",description:"Le travail, les ressources et les conditions matérielles du quotidien.",iconKey:"briefcase"},
  {slug:"relations-identite-personnelle",name:"Relations & identité personnelle",description:"Les relations, la santé et la construction de soi.",iconKey:"users"},
  {slug:"culture-divertissement",name:"Culture & divertissement",description:"Les pratiques culturelles, sportives et ludiques.",iconKey:"sparkles"},
  {slug:"mode-vie-passions",name:"Mode de vie & passions",description:"Les goûts, loisirs et manières de vivre.",iconKey:"heart"},
  {slug:"technologies-medias-innovation",name:"Technologies, médias & innovation",description:"Le numérique, l’information, la science et les innovations.",iconKey:"cpu"},
  {slug:"mobilite-deplacements",name:"Mobilité & déplacements",description:"Les transports et les façons de se déplacer.",iconKey:"car"},
].map((item,index)=>({...item,displayOrder:index+1}));

const categoryGroups = [
  ["societe-politique-monde",[
    ["actualite-societe","Actualité & société","Les faits, débats et transformations qui traversent la société.","newspaper"],
    ["politique-citoyennete","Politique & citoyenneté","La vie démocratique, les institutions et la participation citoyenne.","vote"],
    ["monde-geopolitique","Monde & géopolitique","Les relations internationales et les grands équilibres mondiaux.","globe"],
    ["droit-justice-securite","Droit, justice & sécurité","Les droits, la justice et les politiques de sécurité.","scale"],
    ["environnement-climat","Environnement & climat","Le climat, les ressources naturelles et la transition écologique.","leaf"],
    ["territoire-ville-vie-locale","Territoire, ville & vie locale","Les réalités urbaines, rurales et la vie de proximité.","map"],
  ]],
  ["travail-argent-vie-materielle",[
    ["travail-emploi-etudes","Travail, emploi & études","Les parcours scolaires, professionnels et l’organisation du travail.","briefcase"],
    ["entrepreneuriat-business","Entrepreneuriat & business","La création d’activité, l’entreprise et la prise de risque.","chart"],
    ["argent-economie-pouvoir-achat","Argent, économie & pouvoir d’achat","Les revenus, l’épargne, les prix et les choix économiques.","wallet"],
    ["consommation-vie-quotidienne","Consommation & vie quotidienne","Les achats, services et arbitrages du quotidien.","shopping-bag"],
    ["logement-maison-immobilier","Logement, maison & immobilier","L’habitat, la location, l’achat et l’aménagement.","home"],
  ]],
  ["relations-identite-personnelle",[
    ["relations-amour-sexualite","Relations, amour & sexualité","La vie affective, les rencontres et l’intimité.","heart"],
    ["famille-parentalite-amitie","Famille, parentalité & amitié","Les liens familiaux, amicaux et l’éducation.","users"],
    ["sante-physique","Santé physique","La prévention, les soins et la santé du corps.","activity"],
    ["sante-mentale-bien-etre","Santé mentale & bien-être","L’équilibre psychologique, les émotions et le bien-être.","brain"],
    ["mode-beaute-apparence","Mode, beauté & apparence","Le style, l’image de soi et les pratiques esthétiques.","shirt"],
    ["spiritualite-religion-philosophie","Spiritualité, religion & philosophie","Les croyances, les valeurs et les visions du monde.","compass"],
  ]],
  ["culture-divertissement",[
    ["sport","Sport","La pratique sportive, les compétitions et leurs cultures.","trophy"],
    ["cinema-series-anime","Cinéma, séries & anime","Les œuvres audiovisuelles, leurs usages et leurs communautés.","film"],
    ["musique","Musique","Les artistes, genres, concerts et pratiques d’écoute.","music"],
    ["livres-bd-culture","Livres, BD & culture","La lecture, les arts et les lieux culturels.","book"],
    ["jeux-video","Jeux vidéo","Les jeux, plateformes, usages et communautés vidéoludiques.","gamepad"],
  ]],
  ["mode-vie-passions",[
    ["cuisine-alimentation","Cuisine & alimentation","Les goûts, recettes et habitudes alimentaires.","utensils"],
    ["voyage-decouverte","Voyage & découverte","Les destinations, mobilités touristiques et manières de voyager.","plane"],
    ["animaux","Animaux","Les animaux domestiques, sauvages et leur protection.","paw"],
    ["loisirs-passions-creativite","Loisirs, passions & créativité","Les activités personnelles, manuelles et créatives.","palette"],
  ]],
  ["technologies-medias-innovation",[
    ["technologie-internet-intelligence-artificielle","Technologie, internet & intelligence artificielle","Les outils numériques, l’IA et leurs usages.","cpu"],
    ["medias-reseaux-sociaux-information","Médias, réseaux sociaux & information","La production, circulation et fiabilité de l’information.","radio"],
    ["science-innovation","Science & innovation","La recherche scientifique et les innovations qui transforment la société.","flask"],
  ]],
  ["mobilite-deplacements",[
    ["automobile-transports-mobilite","Automobile, transports & mobilité","Les véhicules, transports collectifs et déplacements du quotidien.","car"],
  ]],
];

export const categories = categoryGroups.flatMap(([universeSlug,items])=>items.map(([slug,name,description,iconKey],index)=>({universeSlug,slug,name,description,iconKey,displayOrder:index+1})));

const high = new Set(["lgbtqia-plus","personnes-handicapees","sexualite","consentement","grossesse","immigration","discrimination","harcelement","violences","guerre","maladie","handicap","vaccination","anxiete","therapie","depression","addiction","alcool","drogues","genetique","recherche-medicale","religion"]);
const medium = new Set(["femmes","hommes","jeunes-adultes","parents","seniors","celibataires","couples","demandeurs-emploi","aidants","mariage","divorce","infidelite","jalousie","desir-enfant","deuil","democratie","vote","abstention","impots","inegalites","liberte-expression","securite","police","prison","justice","salaire","chomage","credit","retraite","patrimoine","richesse","logement-social","sommeil","medecins","hopital","stress","charge-mentale","nucleaire","dopage","vie-privee","cybersecurite","fake-news"]);

const tagSlugs = `femmes hommes lgbtqia-plus jeunes-adultes etudiants parents seniors celibataires couples salaries independants entrepreneurs demandeurs-emploi personnes-handicapees aidants
amour couple rencontre mariage divorce infidelite jalousie sexualite consentement desir-enfant grossesse education amitie famille solitude deuil pardon
democratie vote abstention impots services-publics inegalites immigration discrimination harcelement liberte-expression securite police prison justice violences union-europeenne guerre mondialisation
orientation diplome recrutement salaire management teletravail reconversion chomage equilibre-vie-travail creation-entreprise reussite prise-de-risque pouvoir-achat epargne investissement credit retraite inflation patrimoine richesse publicite promotions abonnements seconde-main achats-en-ligne
achat-immobilier location colocation renovation voisinage logement-social ruralite banlieue grande-ville petite-ville vie-locale commerces-proximite
sommeil alimentation sport-sante prevention medecins hopital maladie handicap vaccination anxiete stress therapie depression confiance-en-soi charge-mentale addiction alcool drogues ecrans
climat ecologie pollution energie nucleaire biodiversite dechets consommation-responsable agriculture
football formule-1 jeux-olympiques sport-feminin dopage cinema-francais streaming anime manga spoilers rap pop rock k-pop concerts livres bandes-dessinees musees jeux-en-ligne esport jeux-mobiles
cuisine-maison restaurant livraison vegetarisme viande gaspillage-alimentaire produits-locaux voyage-solo voyage-couple expatriation tourisme avion chiens chats adoption elevage protection-animale chasse zoos
intelligence-artificielle smartphone apple android vie-privee cybersecurite objets-connectes automatisation reseaux-sociaux influenceurs fake-news television journalisme algorithmes robotique espace genetique recherche-medicale
voiture moto permis vitesse voiture-electrique transports-en-commun velo trottinette covoiturage stationnement`.split(/\s+/);

const title = (slug)=>slug.split("-").map((part)=>part==="lgbtqia"?"LGBTQIA":part.charAt(0).toUpperCase()+part.slice(1)).join(" ");
export const tags = tagSlugs.map((slug)=>({slug,name:title(slug),normalizedName:slug.replaceAll("-"," "),description:"",sensitivity:high.has(slug)?"high":medium.has(slug)?"medium":"low",isFeatured:false}));

export const categoryTags = {
  "actualite-societe":["services-publics","inegalites","immigration","discrimination","harcelement","liberte-expression","violences","mondialisation"],
  "politique-citoyennete":["democratie","vote","abstention","impots","services-publics","liberte-expression","union-europeenne"],
  "monde-geopolitique":["immigration","union-europeenne","guerre","mondialisation","climat","energie"],
  "droit-justice-securite":["securite","police","prison","justice","violences","harcelement","liberte-expression"],
  "environnement-climat":["climat","ecologie","pollution","energie","nucleaire","biodiversite","dechets","consommation-responsable","agriculture"],
  "territoire-ville-vie-locale":["ruralite","banlieue","grande-ville","petite-ville","vie-locale","commerces-proximite","voisinage","services-publics"],
  "travail-emploi-etudes":["etudiants","salaries","demandeurs-emploi","orientation","diplome","recrutement","salaire","management","teletravail","reconversion","chomage","equilibre-vie-travail"],
  "entrepreneuriat-business":["independants","entrepreneurs","creation-entreprise","reussite","prise-de-risque","investissement","management"],
  "argent-economie-pouvoir-achat":["pouvoir-achat","epargne","investissement","credit","retraite","inflation","patrimoine","richesse","impots","salaire"],
  "consommation-vie-quotidienne":["publicite","promotions","abonnements","seconde-main","achats-en-ligne","consommation-responsable","livraison"],
  "logement-maison-immobilier":["achat-immobilier","location","colocation","renovation","voisinage","logement-social","patrimoine"],
  "relations-amour-sexualite":["celibataires","couples","amour","couple","rencontre","mariage","divorce","infidelite","jalousie","sexualite","consentement","desir-enfant","pardon","lgbtqia-plus"],
  "famille-parentalite-amitie":["parents","aidants","education","amitie","famille","solitude","deuil","pardon","grossesse","desir-enfant"],
  "sante-physique":["sommeil","alimentation","sport-sante","prevention","medecins","hopital","maladie","handicap","vaccination","alcool","drogues"],
  "sante-mentale-bien-etre":["anxiete","stress","therapie","depression","confiance-en-soi","charge-mentale","addiction","solitude","deuil","ecrans"],
  "mode-beaute-apparence":["femmes","hommes","jeunes-adultes","confiance-en-soi","publicite","reseaux-sociaux","influenceurs"],
  "spiritualite-religion-philosophie":["liberte-expression","deuil","pardon","confiance-en-soi"],
  "sport":["football","formule-1","jeux-olympiques","sport-feminin","dopage","sport-sante"],
  "cinema-series-anime":["cinema-francais","streaming","anime","manga","spoilers","television"],
  "musique":["rap","pop","rock","k-pop","concerts","streaming"],
  "livres-bd-culture":["livres","bandes-dessinees","musees","manga"],
  "jeux-video":["jeux-en-ligne","esport","jeux-mobiles","ecrans","streaming"],
  "cuisine-alimentation":["cuisine-maison","restaurant","livraison","vegetarisme","viande","gaspillage-alimentaire","produits-locaux","alimentation","agriculture"],
  "voyage-decouverte":["voyage-solo","voyage-couple","expatriation","tourisme","avion","consommation-responsable"],
  "animaux":["chiens","chats","adoption","elevage","protection-animale","chasse","zoos","biodiversite"],
  "loisirs-passions-creativite":["livres","bandes-dessinees","musees","cuisine-maison","jeux-en-ligne","concerts"],
  "technologie-internet-intelligence-artificielle":["intelligence-artificielle","smartphone","apple","android","vie-privee","cybersecurite","objets-connectes","automatisation","algorithmes","robotique","ecrans"],
  "medias-reseaux-sociaux-information":["reseaux-sociaux","influenceurs","fake-news","television","journalisme","algorithmes","liberte-expression","publicite"],
  "science-innovation":["robotique","espace","genetique","recherche-medicale","intelligence-artificielle","energie","nucleaire"],
  "automobile-transports-mobilite":["voiture","moto","permis","vitesse","voiture-electrique","transports-en-commun","velo","trottinette","covoiturage","stationnement","avion"],
};

export function validateCatalog(){
  if(universes.length!==7)throw new Error("La taxonomie doit contenir exactement 7 univers.");
  if(categories.length!==30)throw new Error("La taxonomie doit contenir exactement 30 catégories.");
  const unique=(values,label)=>{if(new Set(values).size!==values.length)throw new Error(`Slugs ${label} dupliqués.`)};
  unique(universes.map(({slug})=>slug),"univers");unique(categories.map(({slug})=>slug),"catégorie");unique(tags.map(({slug})=>slug),"tag");
  const tagSet=new Set(tags.map(({slug})=>slug));const categorySet=new Set(categories.map(({slug})=>slug));
  for(const [category,assigned] of Object.entries(categoryTags)){if(!categorySet.has(category))throw new Error(`Catégorie inconnue: ${category}`);for(const tag of assigned)if(!tagSet.has(tag))throw new Error(`Tag inconnu: ${tag}`)}
  return true;
}
