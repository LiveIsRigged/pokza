/**
 * LA BANQUE DE LIEUX — les endroits où l'on joue au poker, proposés à la saisie.
 *
 * Deux services rendus, dans cet ordre d'importance :
 *  1. UNIFORMISER l'écriture. Sans banque, le Bellagio s'écrit « Bellagio », « Las Vegas Bellagio »
 *     ou « bellagio LV » selon l'auteur, et rien ne les rapproche. C'est le vrai enjeu : une entrée
 *     mal orthographiée coûte plus cher qu'une entrée manquante.
 *  2. Accélérer la saisie : trois lettres suffisent à faire apparaître le lieu.
 *
 * ⚠️ CE QUI EST STOCKÉ, C'EST `nom`, UN SIMPLE TEXTE — pas l'identifiant. `posts.location` reste
 * une colonne `text` et ne change pas. L'`id` n'existe que pour cette table : il sert à corriger un
 * nom sans perdre la trace de l'entrée, et il rendrait possible plus tard une colonne `venue_id`
 * (« toutes mes mains au Bellagio ») sans avoir à redevenir les auteurs de leurs mains publiées.
 *
 * DEUX RÈGLES DE FORME, décidées le 30/08/2026 :
 *  — la ville est DÉJÀ dans le nom du lieu → on ne la répète pas (« Casino de Barcelone »,
 *    « Spielbank Wiesbaden ») ;
 *  — elle n'y est pas → nom, virgule, ville (« Commerce Casino, Los Angeles »).
 * Une conséquence utile : la ville est TOUJOURS quelque part dans `nom`. La recherche n'a donc
 * qu'un seul champ à balayer, et chercher par la ville ou par le casino est le même code.
 *
 * CE QUE LA BANQUE NE PRÉTEND PAS ÊTRE : une source vérifiée. Elle est écrite de mémoire, les
 * salles ferment et changent de nom. C'est assumé, parce que l'erreur est peu chère dans les deux
 * sens : un lieu manquant se tape à la main (la saisie libre n'est jamais entravée), et un lieu
 * sans poker n'est jamais choisi — personne n'a de main à publier depuis un endroit où il n'a pas
 * joué. Le seul coût réel de la sur-inclusion, c'est le plafond de 5 suggestions, qu'une salle
 * fantôme occupe pour rien. D'où l'élagage : on ne garde que là où le poker vivant est plausible.
 */

import { fold } from '../utils/recherche';

export interface Lieu {
  /** Identifiant stable. Ne change JAMAIS, même quand `nom` est corrigé. */
  id: string;
  /** Ce qui s'affiche et ce qui se stocke. Tient dans `LOCATION_MAX_LENGTH`. */
  nom: string;
  /**
   * Termes de recherche supplémentaires, jamais affichés : le nom local (« casino barcelona »),
   * l'abréviation d'usage (« the vic »), ou la commune quand elle n'est plus le nom affiché
   * (« bell gardens » pour le Bicycle). Toujours en minuscules sans accent.
   */
  alias?: string[];
  /**
   * LA salle qu'on cherche en tapant l'enseigne seule. Passe devant ses homonymes à rang égal.
   *
   * Sans ce drapeau, « grosvenor » renvoie cinq salles par ordre alphabétique — Birmingham,
   * Brighton, Bristol, Cardiff, Edinburgh — et le Vic, la plus grande de Londres, n'apparaît
   * nulle part. L'alphabet est un départage acceptable entre inconnues, jamais entre une
   * référence et ses succursales. Même problème pour « barrière », « spielbank », « seminole ».
   *
   * À poser avec parcimonie : une enseigne n'a qu'une salle de référence, et beaucoup n'en ont
   * aucune (les trois Texas Card House se valent).
   */
  phare?: true;
}

/**
 * Villes dont le nom français diffère de l'usage local ou anglais. Appliqué automatiquement à
 * toute entrée qui contient la forme française, pour ne pas répéter « london » sur les vingt
 * lignes londoniennes. Sens unique : on écrit en français, on accepte l'autre à la saisie.
 */
const ALIAS_VILLES: Record<string, string[]> = {
  londres: ['london'],
  vienne: ['wien', 'vienna'],
  prague: ['praha'],
  venise: ['venezia', 'venice'],
  manille: ['manila'],
  singapour: ['singapore'],
  bucarest: ['bucuresti', 'bucharest'],
  tbilissi: ['tbilisi'],
  copenhague: ['copenhagen', 'kobenhavn'],
  'le cap': ['cape town'],
  moscou: ['moscow'],
  seville: ['sevilla'],
  barcelone: ['barcelona'],
  lisbonne: ['lisboa', 'lisbon'],
  bale: ['basel', 'basle'],
  geneve: ['geneva', 'genf'],
  zurich: ['zuerich'],
  bruxelles: ['brussels', 'brussel'],
  cologne: ['koln', 'koeln'],
  hambourg: ['hamburg'],
  munich: ['munchen', 'muenchen'],
  varsovie: ['warszawa', 'warsaw'],
  athenes: ['athens', 'athina'],
  malte: ['malta'],
  chypre: ['cyprus'],
  montreal: ['montreal'],
  quebec: ['quebec city'],
};

/**
 * LA BANQUE. Ordre indifférent : le classement des suggestions est calculé (cf. `chercherLieux`),
 * pas hérité de la position dans ce tableau. Regroupée par zone pour la relecture humaine.
 *
 * Les `id` suivent « pays-ville-salle » et ne sont jamais réutilisés.
 */
export const LIEUX: Lieu[] = [
  // ─── FRANCE — clubs de jeux parisiens ─────────────────────────────────────────────────────────
  // Cadre légal pérennisé en 2025. Les clubs dont l'offre « poker » est un jeu de contrepartie
  // (Ultimate Poker) sont volontairement absents : on ne joue pas contre les autres joueurs, ce
  // n'est pas une main racontable dans Pokza.
  { id: 'fr-paris-partouche', nom: 'Partouche Casino Club, Paris', alias: ['grande armee', 'texapoker'] },
  { id: 'fr-paris-barriere', nom: 'Club Barrière Paris', alias: ['champs elysees'] },
  { id: 'fr-paris-charron', nom: 'Club Pierre Charron, Paris', alias: ['partouche'] },
  { id: 'fr-paris-circus', nom: 'Club Circus Paris', alias: ['murat'] },
  { id: 'fr-paris-montmartre', nom: 'Club Montmartre, Paris', alias: ['clichy montmartre', 'ccm'] },
  { id: 'fr-paris-elysees', nom: 'Paris Élysées Club', alias: ['marbeuf'] },

  // ─── FRANCE — casinos ─────────────────────────────────────────────────────────────────────────
  { phare: true, id: 'fr-enghien', nom: "Casino Barrière d'Enghien-les-Bains", alias: ['enghien'] },
  { id: 'fr-lille', nom: 'Casino Barrière de Lille' },
  { id: 'fr-toulouse', nom: 'Casino Barrière de Toulouse' },
  { id: 'fr-deauville', nom: 'Casino Barrière de Deauville' },
  { id: 'fr-cannes', nom: 'Casino Barrière de Cannes', alias: ['croisette', 'les princes'] },
  { id: 'fr-bordeaux', nom: 'Casino Barrière de Bordeaux', alias: ['bordeaux lac'] },
  { id: 'fr-touquet', nom: 'Casino Barrière du Touquet', alias: ['le touquet'] },
  { id: 'fr-ribeauville', nom: 'Casino Barrière de Ribeauvillé', alias: ['alsace'] },
  { id: 'fr-blotzheim', nom: 'Casino Barrière de Blotzheim', alias: ['bale', 'saint louis'] },
  { id: 'fr-niederbronn', nom: 'Casino Barrière de Niederbronn' },
  { id: 'fr-menton', nom: 'Casino Barrière de Menton' },
  { id: 'fr-biarritz', nom: 'Casino Barrière de Biarritz' },
  { id: 'fr-pornic', nom: 'Casino de Pornic', alias: ['barriere', 'nantes'] },
  { id: 'fr-pornichet', nom: 'Casino de Pornichet', alias: ['barriere', 'la baule', 'saint nazaire'] },
  { id: 'fr-trouville', nom: 'Casino Barrière de Trouville' },
  { id: 'fr-dinard', nom: 'Casino Barrière de Dinard' },
  { id: 'fr-saintemaxime', nom: 'Casino Barrière de Sainte-Maxime' },
  { id: 'fr-lyonvert', nom: 'Casino Le Lyon Vert', alias: ['lyon', 'la tour de salvagny', 'charbonnieres'] },
  { id: 'fr-aix', nom: "Pasino Grand, Aix-en-Provence", alias: ['partouche'] },
  { id: 'fr-saintamand', nom: 'Pasino de Saint-Amand-les-Eaux', alias: ['valenciennes'] },
  { id: 'fr-amneville', nom: "Casino d'Amnéville", alias: ['seven casino', 'metz'] },
  { id: 'fr-divonne', nom: 'Casino de Divonne-les-Bains', alias: ['geneve', 'divonne'] },
  { id: 'fr-forges', nom: 'Casino de Forges-les-Eaux', alias: ['rouen'] },
  { id: 'fr-nice-mediterranee', nom: 'Palais de la Méditerranée, Nice', alias: ['partouche'] },
  { id: 'fr-aixlesbains', nom: 'Casino Grand Cercle, Aix-les-Bains' },
  { id: 'fr-annemasse', nom: "Casino d'Annemasse", alias: ['geneve'] },
  { id: 'fr-saintjulien', nom: 'Casino de Saint-Julien-en-Genevois', alias: ['geneve'] },
  { id: 'fr-vichy', nom: 'Casino de Vichy', alias: ['grand cafe'] },
  { id: 'fr-besancon', nom: 'Casino de Besançon' },
  { id: 'fr-dieppe', nom: 'Casino de Dieppe' },
  { id: 'fr-cabourg', nom: 'Casino de Cabourg' },
  { id: 'fr-larochelle', nom: 'Casino de La Rochelle' },
  { id: 'fr-royan', nom: 'Casino de Royan' },
  { id: 'fr-arcachon', nom: "Casino d'Arcachon" },
  { id: 'fr-capbreton', nom: 'Casino de Capbreton', alias: ['hossegor'] },
  { id: 'fr-saintjeandeluz', nom: 'Casino de Saint-Jean-de-Luz' },
  { id: 'fr-lagrandemotte', nom: 'Casino de La Grande-Motte', alias: ['montpellier'] },
  { id: 'fr-palavas', nom: 'Casino de Palavas-les-Flots', alias: ['montpellier'] },
  { id: 'fr-gruissan', nom: 'Casino de Gruissan', alias: ['narbonne'] },
  { id: 'fr-canet', nom: 'Casino de Canet-en-Roussillon', alias: ['perpignan'] },
  { id: 'fr-barcares', nom: 'Casino Le Lydia, Le Barcarès', alias: ['perpignan'] },
  { id: 'fr-juanlespins', nom: 'Casino de Juan-les-Pins', alias: ['antibes', 'eden beach'] },
  { id: 'fr-cagnes', nom: 'Casino Terrazur, Cagnes-sur-Mer', alias: ['nice'] },
  { id: 'fr-beaulieu', nom: 'Casino de Beaulieu-sur-Mer', alias: ['nice'] },
  { id: 'fr-saintraphael', nom: 'Casino de Saint-Raphaël' },
  { id: 'fr-bandol', nom: 'Casino de Bandol', alias: ['toulon'] },
  { id: 'fr-sanary', nom: 'Casino de Sanary', alias: ['toulon'] },
  { id: 'fr-cassis', nom: 'Casino de Cassis', alias: ['marseille'] },
  { id: 'fr-laciotat', nom: 'Casino de La Ciotat', alias: ['marseille'] },
  { id: 'fr-hyeres', nom: "Casino de Hyères", alias: ['toulon'] },
  { id: 'fr-montrond', nom: 'Casino de Montrond-les-Bains', alias: ['saint etienne', 'joa'] },
  { id: 'fr-boulogne', nom: 'Casino de Boulogne-sur-Mer' },
  { id: 'fr-calais', nom: 'Casino de Calais' },
  { id: 'fr-lehavre', nom: 'Casino du Havre', alias: ['le havre'] },
  { id: 'fr-bagnoles', nom: "Casino de Bagnoles-de-l'Orne" },
  { id: 'fr-contrexeville', nom: 'Casino de Contrexéville', alias: ['joa', 'vittel'] },
  { id: 'fr-luxeuil', nom: 'Casino de Luxeuil-les-Bains', alias: ['joa'] },
  { id: 'fr-chatelguyon', nom: 'Casino de Châtel-Guyon', alias: ['clermont ferrand', 'joa'] },
  { id: 'fr-gujan', nom: 'Casino de Gujan-Mestras', alias: ['bordeaux', 'arcachon'] },

  // ─── BELGIQUE, LUXEMBOURG, MONACO ─────────────────────────────────────────────────────────────
  { id: 'be-bruxelles-viage', nom: 'Grand Casino Brussels Viage', alias: ['bruxelles'] },
  { id: 'be-namur', nom: 'Casino de Namur', alias: ['ardent'] },
  { id: 'be-knokke', nom: 'Casino de Knokke' },
  { id: 'be-blankenberge', nom: 'Casino de Blankenberge' },
  { id: 'be-ostende', nom: "Casino d'Ostende", alias: ['oostende'] },
  { id: 'be-chaudfontaine', nom: 'Casino de Chaudfontaine', alias: ['liege'] },
  { id: 'be-dinant', nom: 'Casino de Dinant' },
  { id: 'be-spa', nom: 'Casino de Spa' },
  { id: 'lu-mondorf', nom: 'Casino 2000, Mondorf-les-Bains', alias: ['luxembourg'] },
  { id: 'mc-montecarlo', nom: 'Casino de Monte-Carlo', alias: ['monaco'] },
  { id: 'mc-soleil', nom: 'Sun Casino, Monaco', alias: ['monte carlo'] },

  // ─── SUISSE ───────────────────────────────────────────────────────────────────────────────────
  { id: 'ch-montreux', nom: 'Casino de Montreux' },
  { id: 'ch-baden', nom: 'Grand Casino Baden' },
  { id: 'ch-lucerne', nom: 'Grand Casino Luzern', alias: ['lucerne'] },
  { id: 'ch-lugano', nom: 'Casino Lugano' },
  { id: 'ch-zurich', nom: 'Swiss Casinos Zürich' },
  { id: 'ch-berne', nom: 'Grand Casino Bern', alias: ['berne'] },
  { id: 'ch-bale', nom: 'Grand Casino Basel', alias: ['bale'] },
  { id: 'ch-geneve', nom: 'Grand Casino Genève', alias: ['geneve'] },
  { id: 'ch-neuchatel', nom: 'Casino de Neuchâtel' },
  { id: 'ch-stgall', nom: 'Grand Casino St. Gallen', alias: ['saint gall'] },
  { id: 'ch-davos', nom: 'Casino Davos' },
  { id: 'ch-interlaken', nom: 'Casino Interlaken' },

  // ─── ROYAUME-UNI & IRLANDE ────────────────────────────────────────────────────────────────────
  // Grosvenor exploite une trentaine de salles ; une seule adhésion vaut pour tout le groupe. Les
  // quatre salles londoniennes portent donc leur enseigne locale, sinon elles seraient indistinctes.
  { phare: true, id: 'gb-londres-vic', nom: 'Grosvenor Victoria, Londres', alias: ['the vic', 'gukpt'] },
  { id: 'gb-londres-hippodrome', nom: 'The Hippodrome, Londres', alias: ['leicester square', 'pokerstars'] },
  { id: 'gb-londres-empire', nom: 'Empire Casino, Londres', alias: ['leicester square'] },
  { id: 'gb-londres-stratford', nom: 'Aspers Stratford, Londres', alias: ['westfield'] },
  { id: 'gb-londres-palmbeach', nom: 'Palm Beach Casino, Londres', alias: ['mayfair'] },
  { id: 'gb-londres-horseshoe', nom: 'Golden Horseshoe, Londres', alias: ['grosvenor', 'bayswater'] },
  { id: 'gb-londres-parktower', nom: 'Park Tower, Londres', alias: ['grosvenor', 'knightsbridge'] },
  { id: 'gb-nottingham-dtd', nom: 'Dusk Till Dawn, Nottingham', alias: ['dtd'] },
  { id: 'gb-manchester', nom: 'Grosvenor Manchester', alias: ['bury new road'] },
  { id: 'gb-birmingham', nom: 'Grosvenor Birmingham', alias: ['hill street'] },
  { id: 'gb-sheffield', nom: 'Napoleons, Sheffield' },
  { id: 'gb-luton', nom: 'Grosvenor Luton' },
  { id: 'gb-leeds', nom: 'Grosvenor Leeds', alias: ['westgate'] },
  { id: 'gb-glasgow', nom: 'Grosvenor Glasgow', alias: ['riverboat'] },
  { id: 'gb-edimbourg', nom: 'Grosvenor Edinburgh', alias: ['edimbourg'] },
  { id: 'gb-cardiff', nom: 'Grosvenor Cardiff' },
  { id: 'gb-newcastle', nom: 'Aspers Newcastle' },
  { id: 'gb-brighton', nom: 'Grosvenor Brighton' },
  { id: 'gb-bristol', nom: 'Grosvenor Bristol' },
  { id: 'gb-liverpool', nom: 'Grosvenor Liverpool' },
  { id: 'ie-dublin-fitz', nom: 'Fitzwilliam Card Club, Dublin', alias: ['the fitz'] },
  { id: 'ie-dublin-sporting', nom: 'The Sporting Emporium, Dublin' },

  // ─── ALLEMAGNE ────────────────────────────────────────────────────────────────────────────────
  // ÉLAGUÉ. Le poker vivant s'est fortement contracté depuis le traité d'État de 2021 : beaucoup de
  // Spielbanken n'ont plus que des machines. On ne garde que celles dont le poker de table est
  // établi. Retirées faute de poker crédible : Köln, Mainz, Hannover, Bremen, Bad Zwischenahn.
  { phare: true, id: 'de-berlin', nom: 'Spielbank Berlin', alias: ['potsdamer platz'] },
  { id: 'de-hohensyburg', nom: 'Spielbank Hohensyburg, Dortmund', alias: [] },
  { id: 'de-schenefeld', nom: 'Spielbank Schenefeld', alias: ['hambourg', 'hamburg'] },
  { id: 'de-hambourg', nom: 'Spielbank Hamburg', alias: ['esplanade', 'reeperbahn'] },
  { id: 'de-wiesbaden', nom: 'Spielbank Wiesbaden', alias: ['francfort'] },
  { id: 'de-duisbourg', nom: 'Spielbank Duisburg', alias: ['duisbourg'] },
  { id: 'de-badhomburg', nom: 'Spielbank Bad Homburg', alias: ['francfort'] },
  { id: 'de-badenbaden', nom: 'Spielbank Baden-Baden' },
  { id: 'de-stuttgart', nom: 'Spielbank Stuttgart' },
  { id: 'de-aixlachapelle', nom: 'Spielbank Aachen', alias: ['aix la chapelle'] },
  { id: 'de-sarrebruck', nom: 'Spielbank Saarbrücken', alias: ['sarrebruck'] },

  // ─── AUTRICHE ─────────────────────────────────────────────────────────────────────────────────
  { phare: true, id: 'at-vienne-ccc', nom: 'Concord Card Casino, Vienne', alias: ['ccc'] },
  { id: 'at-simmering-ccc', nom: 'CCC Simmering, Vienne', alias: ['concord card casino'] },
  { id: 'at-vienne', nom: 'Casino Wien', alias: ['vienne'] },
  { id: 'at-baden', nom: 'Casino Baden', alias: ['capt', 'vienne'] },
  { id: 'at-velden', nom: 'Casino Velden', alias: ['poker em'] },
  { id: 'at-salzbourg', nom: 'Casino Salzburg', alias: ['salzbourg'] },
  { id: 'at-innsbruck', nom: 'Casino Innsbruck' },
  { id: 'at-linz', nom: 'Casino Linz' },
  { id: 'at-graz', nom: 'Casino Graz' },
  { id: 'at-bregenz', nom: 'Casino Bregenz' },
  { id: 'at-seefeld', nom: 'Casino Seefeld' },

  // ─── RESTE DE L'EUROPE ────────────────────────────────────────────────────────────────────────
  { phare: true, id: 'cz-rozvadov', nom: "King's Resort, Rozvadov", alias: ['kings', 'wsope'] },
  { id: 'cz-prague-atrium', nom: 'Casino Atrium, Prague', alias: ['hilton'] },
  { id: 'cz-prague-rebuy', nom: 'Rebuy Stars, Prague' },
  { id: 'sk-bratislava', nom: 'Banco Casino, Bratislava' },
  { id: 'es-barcelone', nom: 'Casino de Barcelone', alias: ['casino barcelona', 'ept'] },
  { id: 'es-madrid', nom: 'Casino Gran Madrid', alias: ['torrelodones', 'madrid'] },
  { id: 'es-madrid-colon', nom: 'Casino Gran Vía, Madrid' },
  { id: 'es-ibiza', nom: "Casino d'Ibiza", alias: ['ibiza'] },
  { id: 'es-marbella', nom: 'Casino de Marbella', alias: ['malaga'] },
  { id: 'es-valence', nom: 'Casino Cirsa Valencia', alias: ['valence'] },
  { id: 'es-seville', nom: 'Casino de Séville', alias: ['sevilla'] },
  { id: 'pt-estoril', nom: 'Casino Estoril', alias: ['lisbonne', 'cascais'] },
  { id: 'pt-lisbonne', nom: 'Casino Lisboa', alias: ['lisbonne', 'parque das nacoes'] },
  { id: 'it-venise', nom: 'Casino de Venise', alias: ['casino di venezia', 'ca noghera'] },
  { id: 'it-sanremo', nom: 'Casino de Sanremo', alias: ['casino di sanremo'] },
  { id: 'it-saintvincent', nom: 'Casino de Saint-Vincent', alias: ['vallee daoste', 'aoste'] },
  { id: 'it-campione', nom: 'Casino de Campione', alias: ['campione ditalia', 'lugano'] },
  { phare: true, id: 'nl-amsterdam', nom: 'Holland Casino Amsterdam' },
  { id: 'nl-rotterdam', nom: 'Holland Casino Rotterdam' },
  { id: 'nl-scheveningen', nom: 'Holland Casino Scheveningen', alias: ['la haye', 'den haag'] },
  { id: 'nl-utrecht', nom: 'Holland Casino Utrecht' },
  { id: 'si-novagorica', nom: 'Casino Perla, Nova Gorica', alias: ['slovenie'] },
  { id: 'hu-budapest', nom: 'Las Vegas Casino, Budapest' },
  { id: 'fi-helsinki', nom: 'Casino Helsinki' },
  { id: 'se-stockholm', nom: 'Casino Cosmopol Stockholm' },
  { id: 'dk-copenhague', nom: 'Casino Copenhague', alias: ['casino copenhagen'] },
  { id: 'dk-helsingor', nom: 'Casino Marienlyst, Helsingør', alias: ['elseneur'] },
  { id: 'mt-portomaso', nom: 'Portomaso Casino, Malte', alias: ['saint julien', 'st julians'] },
  { id: 'mt-casinomalta', nom: 'Casino Malta, Malte', alias: ['olympic', 'saint julien'] },
  { id: 'cy-limassol', nom: 'City of Dreams, Limassol', alias: ['chypre', 'mediterranean'] },
  { id: 'cy-kyrenia', nom: 'Merit Crystal Cove, Kyrenia', alias: ['chypre'] },
  { id: 'cy-merit-royal', nom: 'Merit Royal, Kyrenia', alias: ['chypre'] },
  { id: 'gr-loutraki', nom: 'Casino Loutraki', alias: ['athenes'] },
  { id: 'ro-bucarest', nom: 'Grand Casino Bucarest', alias: ['jw marriott'] },
  { id: 'ee-tallinn', nom: 'Olympic Park Casino, Tallinn' },
  { id: 'ge-tbilissi', nom: 'Shangri La, Tbilissi', alias: ['georgie'] },
  { id: 'ge-batoumi', nom: 'Casino de Batoumi', alias: ['batumi', 'georgie'] },

  // ─── ÉTATS-UNIS — Las Vegas ───────────────────────────────────────────────────────────────────
  // Resorts World (fermée le 30/03/2026) et Poker Palace (30/09/2025) sont volontairement absentes.
  { id: 'us-lv-bellagio', nom: 'Bellagio, Las Vegas', alias: ['bobs room'] },
  { id: 'us-lv-aria', nom: 'Aria, Las Vegas' },
  { id: 'us-lv-wynn', nom: 'Wynn, Las Vegas' },
  { id: 'us-lv-venetian', nom: 'The Venetian, Las Vegas' },
  { id: 'us-lv-caesars', nom: 'Caesars Palace, Las Vegas' },
  { id: 'us-lv-horseshoe', nom: 'Horseshoe, Las Vegas', alias: ['ballys', 'wsop'] },
  { id: 'us-lv-planethollywood', nom: 'Planet Hollywood, Las Vegas' },
  { id: 'us-lv-mgm', nom: 'MGM Grand, Las Vegas' },
  { id: 'us-lv-goldennugget', nom: 'Golden Nugget, Las Vegas', alias: ['downtown', 'fremont'] },
  { id: 'us-lv-orleans', nom: 'The Orleans, Las Vegas' },
  { id: 'us-lv-southpoint', nom: 'South Point, Las Vegas' },
  { id: 'us-lv-redrock', nom: 'Red Rock Resort, Las Vegas' },
  { id: 'us-lv-santafe', nom: 'Santa Fe Station, Las Vegas' },
  { id: 'us-lv-boulder', nom: 'Boulder Station, Las Vegas' },
  { id: 'us-lv-suncoast', nom: 'Suncoast, Las Vegas' },
  { id: 'us-lv-westgate', nom: 'Westgate, Las Vegas' },
  { id: 'us-lv-gvr', nom: 'Green Valley Ranch, Las Vegas', alias: ['henderson'] },
  { id: 'us-lv-sunset', nom: 'Sunset Station, Las Vegas', alias: ['henderson'] },

  // ─── ÉTATS-UNIS — Californie ──────────────────────────────────────────────────────────────────
  // Les grandes salles de Los Angeles sont dans des communes distinctes (Commerce, Bell Gardens,
  // Gardena…) : sans l'alias, taper « Los Angeles » n'en trouverait qu'une.
  { phare: true, id: 'us-commerce', nom: 'Commerce Casino, Los Angeles' },
  { id: 'us-bicycle', nom: 'The Bicycle Casino, Los Angeles', alias: ['bell gardens', 'the bike'] },
  { id: 'us-hustler', nom: 'Hustler Casino, Los Angeles', alias: ['gardena', 'hclive'] },
  { id: 'us-gardens', nom: 'The Gardens Casino, Los Angeles', alias: ['hawaiian gardens'] },
  { id: 'us-hollywoodpark', nom: 'Hollywood Park Casino, Los Angeles', alias: ['inglewood'] },
  { id: 'us-bay101', nom: 'Bay 101, San Jose', alias: ['san francisco'] },
  { id: 'us-luckychances', nom: 'Lucky Chances, San Francisco', alias: ['colma'] },
  { id: 'us-oaks', nom: 'Oaks Card Club, San Francisco', alias: ['emeryville', 'oakland'] },
  { id: 'us-thundervalley', nom: 'Thunder Valley, Sacramento', alias: ['lincoln'] },
  { id: 'us-graton', nom: 'Graton Resort, Rohnert Park', alias: ['san francisco'] },
  { id: 'us-stones', nom: 'Stones Gambling Hall, Sacramento', alias: ['citrus heights'] },
  { id: 'us-barona', nom: 'Barona Resort, San Diego', alias: ['lakeside'] },
  { id: 'us-oceans11', nom: "Ocean's Eleven, Oceanside", alias: ['san diego'] },

  // ─── ÉTATS-UNIS — Texas, Floride, Est, Midwest ────────────────────────────────────────────────
  { id: 'us-tch-dallas', nom: 'Texas Card House, Dallas' },
  { id: 'us-tch-austin', nom: 'Texas Card House, Austin' },
  { id: 'us-tch-houston', nom: 'Texas Card House, Houston' },
  { id: 'us-lodge', nom: 'The Lodge Card Club, Austin', alias: ['round rock'] },
  { id: 'us-champions', nom: 'Champions Social, Houston' },
  { phare: true, id: 'us-shrhollywood', nom: 'Seminole Hard Rock, Miami', alias: ['hollywood', 'fort lauderdale', 'floride'] },
  { id: 'us-magiccity', nom: 'Magic City Casino, Miami', alias: ['floride'] },
  { id: 'us-casinomiami', nom: 'Casino Miami', alias: ['jai alai', 'floride'] },
  { id: 'us-coconutcreek', nom: 'Seminole Coconut Creek, Miami', alias: ['fort lauderdale', 'floride'] },
  { id: 'us-pompano', nom: 'Isle Casino, Miami', alias: ['pompano beach', 'fort lauderdale', 'floride'] },
  { id: 'us-shrtampa', nom: 'Seminole Hard Rock, Tampa', alias: ['floride'] },
  { id: 'us-bestbet', nom: 'bestbet Jacksonville', alias: ['floride'] },
  { id: 'us-pbkc', nom: 'Palm Beach Kennel Club', alias: ['west palm beach', 'floride'] },
  { id: 'us-borgata', nom: 'Borgata, Atlantic City' },
  { id: 'us-foxwoods', nom: 'Foxwoods, Mashantucket', alias: ['connecticut'] },
  { id: 'us-mohegan', nom: 'Mohegan Sun, Uncasville', alias: ['connecticut'] },
  { id: 'us-encoreboston', nom: 'Encore Boston Harbor', alias: ['everett', 'boston'] },
  { id: 'us-parx', nom: 'Parx Casino, Philadelphie', alias: ['bensalem'] },
  { id: 'us-riverspittsburgh', nom: 'Rivers Casino, Pittsburgh' },
  { id: 'us-windcreek', nom: 'Wind Creek Bethlehem', alias: ['philadelphie'] },
  { id: 'us-mgmnational', nom: 'MGM National Harbor, Washington', alias: ['oxon hill'] },
  { id: 'us-livemaryland', nom: 'Live! Casino Maryland, Baltimore', alias: ['hanover'] },
  { id: 'us-turningstone', nom: 'Turning Stone, Verona', alias: ['new york'] },
  { id: 'us-thebrook', nom: 'The Brook, Seabrook', alias: ['new hampshire', 'boston'] },
  { id: 'us-hammond', nom: 'Horseshoe Hammond, Chicago' },
  { id: 'us-riversdesplaines', nom: 'Rivers Casino, Chicago', alias: ['des plaines'] },
  { id: 'us-motorcity', nom: 'MotorCity Casino, Detroit' },
  { id: 'us-mgmdetroit', nom: 'MGM Grand Detroit' },
  { id: 'us-potawatomi', nom: 'Potawatomi Casino, Milwaukee' },
  { id: 'us-canterbury', nom: 'Canterbury Park, Minneapolis', alias: ['shakopee'] },
  { id: 'us-councilbluffs', nom: 'Horseshoe Council Bluffs', alias: ['omaha'] },
  { id: 'us-beaurivage', nom: 'Beau Rivage, Biloxi', alias: ['mississippi'] },
  { id: 'us-cherokee', nom: "Harrah's Cherokee", alias: ['caroline du nord'] },
  { id: 'us-winstar', nom: 'WinStar World Casino, Thackerville', alias: ['oklahoma', 'dallas'] },
  { id: 'us-choctaw', nom: 'Choctaw Casino, Durant', alias: ['oklahoma', 'dallas'] },
  { id: 'us-talkingstick', nom: 'Talking Stick Resort, Scottsdale', alias: ['phoenix'] },
  { id: 'us-peppermill', nom: 'Peppermill, Reno' },
  { id: 'us-muckleshoot', nom: 'Muckleshoot Casino, Seattle', alias: ['auburn'] },
  { id: 'us-tulalip', nom: 'Tulalip Resort, Seattle', alias: ['marysville'] },

  // ─── CANADA ───────────────────────────────────────────────────────────────────────────────────
  { id: 'ca-playground', nom: 'Playground Poker Club, Montréal', alias: ['kahnawake'] },
  { id: 'ca-montreal', nom: 'Casino de Montréal' },
  { id: 'ca-lacleamy', nom: 'Casino du Lac-Leamy, Gatineau', alias: ['ottawa'] },
  { id: 'ca-fallsview', nom: 'Fallsview Casino, Niagara Falls' },
  { id: 'ca-rama', nom: 'Casino Rama, Orillia', alias: ['toronto'] },
  { id: 'ca-woodbine', nom: 'Casino Woodbine, Toronto' },
  { id: 'ca-greatblueheron', nom: 'Great Blue Heron, Port Perry', alias: ['toronto'] },
  { id: 'ca-riverrock', nom: 'River Rock Casino, Vancouver', alias: ['richmond'] },
  { id: 'ca-parq', nom: 'Parq Vancouver' },
  { id: 'ca-greyeagle', nom: 'Grey Eagle Resort, Calgary' },
  { id: 'ca-rivercree', nom: 'River Cree Resort, Edmonton' },

  // ─── ASIE ─────────────────────────────────────────────────────────────────────────────────────
  { id: 'ph-okada', nom: 'Okada Manila', alias: ['manille', 'pokerstars live'] },
  { id: 'ph-solaire', nom: 'Solaire Resort, Manille' },
  { id: 'ph-newport', nom: 'Newport World Resorts, Manille', alias: ['resorts world manila'] },
  { id: 'ph-metro', nom: 'Metro Card Club, Manille' },
  { id: 'ph-masters', nom: 'Masters Poker Club, Manille' },
  { id: 'tw-taipei', nom: 'Asia Poker Arena, Taipei', alias: ['taiwan', 'apa'] },
  { id: 'kr-incheon', nom: 'Paradise City, Incheon', alias: ['seoul', 'coree'] },
  { id: 'mo-wynn', nom: 'Wynn Macau', alias: ['macao'] },
  { id: 'mo-venetian', nom: 'The Venetian Macao', alias: ['macao', 'cotai'] },
  { id: 'mo-mgmcotai', nom: 'MGM Cotai, Macao' },
  { id: 'mo-pokerking', nom: 'Poker King Club, Macao', alias: ['starworld', 'pkc'] },
  { id: 'sg-mbs', nom: 'Marina Bay Sands, Singapour' },
  { id: 'sg-sentosa', nom: 'Resorts World Sentosa, Singapour' },
  { id: 'kh-nagaworld', nom: 'NagaWorld, Phnom Penh', alias: ['cambodge'] },
  { id: 'my-genting', nom: 'Resorts World Genting', alias: ['malaisie', 'kuala lumpur'] },
  { id: 'in-goa-deltin', nom: 'Deltin Royale, Goa', alias: ['inde'] },
  { id: 'in-goa-bigdaddy', nom: 'Big Daddy Casino, Goa', alias: ['inde'] },

  // ─── OCÉANIE, AMÉRIQUE LATINE, AFRIQUE, MOYEN-ORIENT ──────────────────────────────────────────
  { id: 'au-crownmelbourne', nom: 'Crown Casino, Melbourne', alias: ['aussie millions'] },
  { id: 'au-star-sydney', nom: 'The Star, Sydney' },
  { id: 'au-star-goldcoast', nom: 'The Star Gold Coast', alias: ['australie'] },
  { id: 'au-crownperth', nom: 'Crown Perth' },
  { id: 'au-skycityadelaide', nom: 'SkyCity Adelaide', alias: ['adelaide'] },
  { id: 'nz-auckland', nom: 'SkyCity Auckland', alias: ['nouvelle zelande'] },
  { id: 'nz-christchurch', nom: 'Christchurch Casino', alias: ['nouvelle zelande'] },
  { id: 'ar-puertomadero', nom: 'Casino de Puerto Madero', alias: ['buenos aires', 'argentine'] },
  { id: 'uy-puntadeleste', nom: 'Hotel Conrad, Punta del Este', alias: ['uruguay'] },
  { id: 'cl-monticello', nom: 'Monticello Grand Casino, Santiago', alias: ['chili'] },
  { id: 'pe-lima', nom: 'Casino Atlantic City, Lima', alias: ['perou'] },
  { id: 'br-cnp', nom: 'Clube Nacional de Poker, São Paulo', alias: ['bresil', 'cnp'] },
  { id: 'br-h2', nom: 'H2 Club, São Paulo', alias: ['bresil'] },
  { id: 'bs-atlantis', nom: 'Atlantis, Nassau', alias: ['bahamas', 'pca'] },
  { id: 'bs-bahamar', nom: 'Baha Mar, Nassau', alias: ['bahamas'] },
  { id: 'do-puntacana', nom: 'Hard Rock, Punta Cana', alias: ['republique dominicaine'] },
  { id: 'za-montecasino', nom: 'Montecasino, Johannesburg', alias: ['afrique du sud'] },
  { id: 'za-emperors', nom: 'Emperors Palace, Johannesburg', alias: ['afrique du sud'] },
  { id: 'za-grandwest', nom: 'GrandWest Casino, Le Cap', alias: ['afrique du sud'] },
  { id: 'ma-marrakech', nom: 'Casino de Marrakech', alias: ['maroc', 'es saadi'] },
  { id: 'ma-mazagan', nom: 'Mazagan Beach Resort, El Jadida', alias: ['maroc', 'casablanca'] },
  { id: 'lb-jounieh', nom: 'Casino du Liban, Jounieh', alias: ['beyrouth'] },
  { id: 'eg-charmelcheikh', nom: 'Casino de Charm el-Cheikh', alias: ['egypte', 'sharm'] },

  // ─── EN LIGNE ─────────────────────────────────────────────────────────────────────────────────
  // Sans ville, forcément : la règle « nom, virgule, ville » ne s'y applique pas. La marque seule
  // suffit à comprendre qu'on parle d'une main jouée en ligne.
  { id: 'online-winamax', nom: 'Winamax' },
  { id: 'online-pokerstars', nom: 'PokerStars' },
  { id: 'online-ggpoker', nom: 'GGPoker', alias: ['gg poker'] },
  { id: 'online-pmu', nom: 'PMU Poker' },
  { id: 'online-unibet', nom: 'Unibet Poker' },
  { id: 'online-betclic', nom: 'Betclic Poker' },
  { id: 'online-partypoker', nom: 'partypoker', alias: ['party poker'] },
  { id: 'online-888', nom: '888poker', alias: ['888 poker'] },
  { id: 'online-bwin', nom: 'Bwin Poker' },
];

/** Trois lettres avant la première suggestion — décidé le 30/08/2026. En deçà, presque toute la
 *  banque correspond et les cinq lignes affichées seraient arbitraires. */
export const LIEU_MIN_CARACTERES = 3;

/** Cinq suggestions au plus — décidé le 30/08/2026. C'est ce plafond qui rend coûteuse une entrée
 *  inutile : elle ne dérange pas en elle-même, elle prend une des cinq places. */
export const LIEU_MAX_SUGGESTIONS = 5;

interface LieuIndexe {
  lieu: Lieu;
  /** `nom` replié — sert au classement de tête (« le nom commence par la saisie »). */
  nomPlie: string;
  /** Les mots de `nom`. La ville en fait toujours partie, d'où l'unique champ à balayer. */
  mots: string[];
  /** Les mots des alias, y compris ceux hérités d'`ALIAS_VILLES`. Classés après ceux du nom. */
  motsAlias: string[];
}

const decouper = (texte: string): string[] => texte.split(/[^\p{L}\p{N}]+/u).filter(Boolean);

/** Construit une fois pour toutes. ~290 entrées : le coût est celui d'un seul rendu, pas d'une
 *  frappe — refaire ce travail à chaque lettre serait le seul vrai risque de latence ici. */
const INDEX: LieuIndexe[] = LIEUX.map((lieu) => {
  const nomPlie = fold(lieu.nom);
  const alias = [...(lieu.alias ?? [])];
  for (const [ville, autres] of Object.entries(ALIAS_VILLES)) {
    if (nomPlie.includes(ville)) alias.push(...autres);
  }
  return {
    lieu,
    nomPlie,
    mots: decouper(nomPlie),
    motsAlias: decouper(fold(alias.join(' '))),
  };
});

const amorce = (mots: string[], morceau: string): boolean => mots.some((m) => m.startsWith(morceau));

/**
 * Les lieux à proposer pour une saisie en cours, du plus au moins pertinent, plafonnés à
 * `LIEU_MAX_SUGGESTIONS`.
 *
 * Trois rangs, alphabétique à l'intérieur de chacun :
 *   0. le nom COMMENCE par la saisie entière — « Bell » → « Bellagio, Las Vegas » ;
 *   1. chaque morceau de la saisie amorce un mot du nom — « Los An » → « Commerce Casino, Los
 *      Angeles », « Casino Div » → « Casino de Divonne-les-Bains » ;
 *   2. il a fallu passer par un alias — « the vic », « manila », « los angeles » pour une salle
 *      d'une commune voisine.
 *
 * Chaque morceau doit amorcer un MOT, et non se trouver n'importe où : sans ça « as » ramènerait
 * les deux cents entrées contenant « casino ». C'est aussi ce qui fait qu'un nom de ville et un nom
 * de casino se cherchent avec le même code, puisque la ville est toujours un mot du nom.
 *
 * Renvoie une liste VIDE quand la saisie reproduit déjà exactement un lieu de la banque : il n'y a
 * plus rien à proposer à quelqu'un qui vient de choisir.
 */
export function chercherLieux(saisie: string, max: number = LIEU_MAX_SUGGESTIONS): Lieu[] {
  const q = fold(saisie).trim().replace(/\s+/g, ' ');
  if (q.length < LIEU_MIN_CARACTERES) return [];
  if (INDEX.some((e) => e.nomPlie === q)) return [];

  const morceaux = q.split(' ');
  const trouves: { lieu: Lieu; rang: number }[] = [];
  for (const e of INDEX) {
    let rang: number;
    if (e.nomPlie.startsWith(q)) rang = 0;
    else if (morceaux.every((m) => amorce(e.mots, m))) rang = 1;
    else if (morceaux.every((m) => amorce(e.mots, m) || amorce(e.motsAlias, m))) rang = 2;
    else continue;
    trouves.push({ lieu: e.lieu, rang });
  }

  trouves.sort(
    (a, b) =>
      a.rang - b.rang ||
      Number(Boolean(b.lieu.phare)) - Number(Boolean(a.lieu.phare)) ||
      a.lieu.nom.localeCompare(b.lieu.nom, 'fr')
  );
  return trouves.slice(0, max).map((t) => t.lieu);
}
