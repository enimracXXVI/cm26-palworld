/**
 * Palpedia Field Tracker — Google Sheet bridge.
 *
 * Paste this into Extensions -> Apps Script on a Google Sheet, add a
 * Script Property named SECRET (Project Settings -> Script Properties),
 * then Deploy -> New deployment -> Web app (Execute as: Me, Who has
 * access: Anyone). Paste the resulting URL and your SECRET into the
 * app's "Google Sheet sync" settings.
 *
 * IMPORTANT if you're updating an existing deployment: editing this
 * file alone does NOT change what your live Web app URL runs. Go to
 * Deploy -> Manage deployments -> pencil icon on your deployment ->
 * Version: New version -> Deploy. (Or make a fresh deployment, but
 * then you must re-paste the new URL into the app.)
 *
 * SCHEMA — six tabs, all lowercase, everything looked up by column
 * name (not position), so reordering or adding your own columns never
 * breaks anything. A missing tab is created with sensible defaults;
 * an existing tab is never restructured, only ever read from — except
 * for a handful of narrow, purpose-built writes: pals.discovered/
 * imageUrl/base/party and passiveSkills.unlocked. pals.base/party and
 * passiveSkills.unlocked are added as new columns if they aren't there
 * yet, appended at the end, nothing else touched.
 *
 *  - breedingLog:   id, createdAt, parentA_palId, parentA_sex,
 *                   parentA_passives, parentA_actives, parentB_palId,
 *                   parentB_sex, parentB_passives, parentB_actives,
 *                   offspring_palId, offspring_sex, offspring_passives,
 *                   offspring_actives, notes. Fully owned by the app.
 *  - pals:          id, palId, name, type, imageUrl, discovered, base,
 *                   party, plus 12 Work Suitability columns (Kindling,
 *                   Watering, Planting, Generating Electricity,
 *                   Handiwork, Gathering, Lumbering, Mining, Medicine
 *                   Production, Cooling, Transporting, Farming) — left
 *                   blank for you to fill in yourself; the app only
 *                   adds and reads these columns, never writes values
 *                   into them. 'type' may be comma- or pipe-separated
 *                   (a Sheets multi-select dropdown auto-joins with
 *                   commas).
 *  - partnerSkills: id, palId, palName, name, description — a
 *                   separate tab, one row per Pal.
 *  - activeSkills:  id, name, element, power, ct, exclusive,
 *                   description, notes — you populate this yourself;
 *                   only 'name' is required for a row to be used.
 *  - elements:      id, code, name, imageUrl — the 9 Palworld types.
 *  - passiveSkills: id, name, rank, surgery, effects, unlocked.
 *                   'effects' may be comma- or pipe-separated.
 *
 * Every *_palId column is read tolerantly: the cell may be the text
 * "001" or the real number 1 (e.g. displayed zero-padded via a custom
 * number format like "000") — either is normalized to "001" in memory
 * on read via normalizePalId_(). Nothing is ever written back to
 * change a palId cell's type or format; the sheet is left exactly as
 * you set it up.
 */

var PALS_SEED = [
  ["001",1,"","Lamball","NE"],
  ["002",2,"","Cattiva","NE"],
  ["003",3,"","Chikipi","NE"],
  ["004",4,"","Lifmunk","GR"],
  ["005",5,"","Fuack","WA"],
  ["005B",5,"B","Fuack Ignis","WA|FI"],
  ["006",6,"","Vixy","NE"],
  ["007",7,"","Celaray","WA"],
  ["007B",7,"B","Celaray Lux","WA|EL"],
  ["008",8,"","Cremis","NE"],
  ["009",9,"","Croajiro","WA"],
  ["009B",9,"B","Croajiro Noct","WA|DA"],
  ["010",10,"","Herbil","GR|NE"],
  ["011",11,"","Teafant","WA"],
  ["012",12,"","Gumoss","GR|GD"],
  ["013",13,"","Pupperai","GD"],
  ["014",14,"","Clovee","GR|NE"],
  ["015",15,"","Jolthog","EL"],
  ["015B",15,"B","Jolthog Cryst","IC"],
  ["016",16,"","Depresso","DA"],
  ["017",17,"","Pengullet","WA|IC"],
  ["017B",17,"B","Pengullet Lux","WA|EL"],
  ["018",18,"","Penking","WA|IC"],
  ["018B",18,"B","Penking Lux","WA|EL"],
  ["019",19,"","Hoocrates","DA"],
  ["020",20,"","Melpaca","NE"],
  ["021",21,"","Kingpaca","NE"],
  ["021B",21,"B","Kingpaca Cryst","IC"],
  ["022",22,"","Daedream","DA"],
  ["023",23,"","Tanzee","GR"],
  ["023B",23,"B","Tanzee Ignis","FI"],
  ["024",24,"","Nox","DA"],
  ["025",25,"","Flambelle","FI"],
  ["026",26,"","Rooby","FI"],
  ["027",27,"","Mau","DA"],
  ["027B",27,"B","Mau Cryst","IC"],
  ["028",28,"","Rushoar","GD"],
  ["029",29,"","Foxparks","FI"],
  ["029B",29,"B","Foxparks Cryst","IC"],
  ["030",30,"","Killamari","DA|WA"],
  ["030B",30,"B","Killamari Primo","NE|WA"],
  ["031",31,"","Fuddler","GD"],
  ["032",32,"","Eikthyrdeer","NE"],
  ["032B",32,"B","Eikthyrdeer Terra","GD"],
  ["033",33,"","Direhowl","NE"],
  ["034",34,"","Caprity","GR"],
  ["034B",34,"B","Caprity Noct","DA"],
  ["035",35,"","Swee","IC"],
  ["036",36,"","Sweepa","IC"],
  ["037",37,"","Turtacle","WA"],
  ["037B",37,"B","Turtacle Terra","WA|GD"],
  ["038",38,"","Hangyu","GD"],
  ["038B",38,"B","Hangyu Cryst","IC"],
  ["039",39,"","Woolipop","NE"],
  ["039B",39,"B","Woolipop Terra","GD"],
  ["040",40,"","Mozzarina","NE"],
  ["041",41,"","Azurobe","WA|DR"],
  ["041B",41,"B","Azurobe Cryst","IC|DR"],
  ["042",42,"","Sparkit","EL"],
  ["043",43,"","Kelpsea","WA"],
  ["043B",43,"B","Kelpsea Ignis","FI"],
  ["044",44,"","Ribbuny","NE"],
  ["044B",44,"B","Ribbuny Botan","GR"],
  ["045",45,"","Jelliette","WA"],
  ["046",46,"","Jellroy","WA|DA"],
  ["047",47,"","Amione","WA"],
  ["048",48,"","Gloopie","WA|DA"],
  ["048B",48,"B","Gloopie Primo","WA|NE"],
  ["049",49,"","Galeclaw","NE"],
  ["050",50,"","Wispaw","DA"],
  ["051",51,"","Nitewing","NE"],
  ["052",52,"","Tombat","DA"],
  ["053",53,"","Tocotoco","NE"],
  ["054",54,"","Univolt","EL"],
  ["054B",54,"B","Univolt Cryst","IC"],
  ["055",55,"","Gobfin","WA"],
  ["055B",55,"B","Gobfin Ignis","FI"],
  ["056",56,"","Loupmoon","DA"],
  ["056B",56,"B","Loupmoon Cryst","IC"],
  ["057",57,"","Cawgnito","DA"],
  ["058",58,"","Arsox","FI"],
  ["059",59,"","Muffly","IC"],
  ["060",60,"","Bristla","GR"],
  ["061",61,"","Cinnamoth","GR"],
  ["062",62,"","Puffolt","EL"],
  ["063",63,"","Elphidran","DR"],
  ["063B",63,"B","Elphidran Aqua","DR|WA"],
  ["064",64,"","Vanwyrm","FI|DA"],
  ["064B",64,"B","Vanwyrm Cryst","IC|DA"],
  ["065",65,"","Felbat","DA"],
  ["066",66,"","Vaelet","GR"],
  ["067",67,"","Beegarde","GR"],
  ["068",68,"","Elizabee","GR"],
  ["069",69,"","Lovander","DA"],
  ["070",70,"","Grintale","NE"],
  ["071",71,"","Tarantriss","DA"],
  ["072",72,"","Polapup","IC|WA"],
  ["072B",72,"B","Polapup Terra","IC|GD"],
  ["073",73,"","Leezpunk","DA"],
  ["073B",73,"B","Leezpunk Ignis","FI"],
  ["074",74,"","Gorirat","NE"],
  ["074B",74,"B","Gorirat Terra","GD"],
  ["075",75,"","Surfent","WA"],
  ["075B",75,"B","Surfent Terra","GD"],
  ["076",76,"","Robinquill","GR"],
  ["076B",76,"B","Robinquill Terra","GR|GD"],
  ["077",77,"","Flopie","GR"],
  ["078",78,"","Wixen","FI"],
  ["078B",78,"B","Wixen Noct","FI|DA"],
  ["079",79,"","Katress","DA"],
  ["079B",79,"B","Katress Ignis","DA|FI"],
  ["080",80,"","Helzephyr","DA"],
  ["080B",80,"B","Helzephyr Lux","DA|EL"],
  ["081",81,"","Elgrove","GR"],
  ["081B",81,"B","Elgrove Cryst","IC"],
  ["082",82,"","Lunaris","NE"],
  ["083",83,"","Fenglope","NE"],
  ["083B",83,"B","Fenglope Lux","EL"],
  ["084",84,"","Dinossom","GR|DR"],
  ["084B",84,"B","Dinossom Lux","EL|DR"],
  ["085",85,"","Bushi","FI"],
  ["085B",85,"B","Bushi Noct","FI|DA"],
  ["086",86,"","Munchill","IC|WA"],
  ["087",87,"","Mammorest","GR|GD"],
  ["087B",87,"B","Mammorest Cryst","IC|GD"],
  ["088",88,"","Finsider","WA"],
  ["088B",88,"B","Finsider Ignis","WA|FI"],
  ["089",89,"","Petallia","GR"],
  ["089B",89,"B","Petallia Ignis","GR|FI"],
  ["090",90,"","Leafan","GR"],
  ["091",91,"","Incineram","FI|DA"],
  ["091B",91,"B","Incineram Noct","DA"],
  ["092",92,"","Dazzi","EL"],
  ["092B",92,"B","Dazzi Noct","DA|EL"],
  ["093",93,"","Pyrin","FI"],
  ["093B",93,"B","Pyrin Noct","FI|DA"],
  ["094",94,"","Relaxaurus","DR|WA"],
  ["094B",94,"B","Relaxaurus Lux","DR|EL"],
  ["095",95,"","Foxcicle","IC"],
  ["096",96,"","Beakon","EL"],
  ["096B",96,"B","Beakon Cryst","IC"],
  ["097",97,"","Ghangler","DA|WA"],
  ["097B",97,"B","Ghangler Ignis","FI|WA"],
  ["098",98,"","Rayhound","EL"],
  ["098B",98,"B","Rayhound Cryst","IC"],
  ["099",99,"","Menasting","DA|GD"],
  ["099B",99,"B","Menasting Terra","GD"],
  ["100",100,"","Needoll","GR"],
  ["100B",100,"B","Needoll Noct","DA|GR"],
  ["101",101,"","Reindrix","IC"],
  ["102",102,"","Mossanda","GR"],
  ["102B",102,"B","Mossanda Lux","EL"],
  ["103",103,"","Chillet","IC|DR"],
  ["103B",103,"B","Chillet Ignis","FI|DR"],
  ["104",104,"","Ragnahawk","FI"],
  ["105",105,"","Moldron","FI|GD"],
  ["105B",105,"B","Moldron Cryst","IC|GD"],
  ["106",106,"","Palumba","GR"],
  ["107",107,"","Digtoise","GD"],
  ["108",108,"","Broncherry","GR"],
  ["108B",108,"B","Broncherry Aqua","GR|WA"],
  ["109",109,"","Dumud","GD|WA"],
  ["109B",109,"B","Dumud Gild","GD|WA"],
  ["110",110,"","Braloha","GR|GD"],
  ["111",111,"","Kitsun","FI"],
  ["111B",111,"B","Kitsun Noct","DA"],
  ["112",112,"","Blazehowl","FI"],
  ["112B",112,"B","Blazehowl Noct","FI|DA"],
  ["113",113,"","Warsect","GD|GR"],
  ["113B",113,"B","Warsect Terra","GD"],
  ["114",114,"","Frostplume","IC"],
  ["115",115,"","Majex","DA|FI"],
  ["116",116,"","Sibelyx","IC"],
  ["116B",116,"B","Sibelyx Primo","NE"],
  ["117",117,"","Maraith","DA"],
  ["118",118,"","Shroomer","GR"],
  ["118B",118,"B","Shroomer Noct","GR|DA"],
  ["119",119,"","Icelyn","IC"],
  ["120",120,"","Gildra","DA|GD"],
  ["121",121,"","Jormuntide","DR|WA"],
  ["121B",121,"B","Jormuntide Ignis","DR|FI"],
  ["122",122,"","Suzaku","FI"],
  ["122B",122,"B","Suzaku Aqua","WA"],
  ["123",123,"","Dazemu","GD"],
  ["124",124,"","Quivern","DR"],
  ["124B",124,"B","Quivern Botan","DR|GR"],
  ["125",125,"","Lullu","GR"],
  ["126",126,"","Kikit","GD"],
  ["127",127,"","Yakumo","NE"],
  ["128",128,"","Skutlass","WA"],
  ["128B",128,"B","Skutlass Ignis","WA|FI"],
  ["129",129,"","Reptyro","FI|GD"],
  ["129B",129,"B","Reptyro Cryst","IC|GD"],
  ["130",130,"","Starryon","DA"],
  ["130B",130,"B","Starryon Primo","NE"],
  ["131",131,"","Pierdon","GD"],
  ["131B",131,"B","Pierdon Cryst","IC"],
  ["132",132,"","Cryolinx","IC"],
  ["132B",132,"B","Cryolinx Terra","GD"],
  ["133",133,"","Snugloo","IC"],
  ["134",134,"","Wumpo","IC"],
  ["134B",134,"B","Wumpo Botan","GR"],
  ["135",135,"","Sootseer","DA|FI"],
  ["136",136,"","Carnibora","GR"],
  ["137",137,"","Blazamut","FI"],
  ["137B",137,"B","Blazamut Ryu","DR|FI"],
  ["138",138,"","Dualith","GD|GR"],
  ["138B",138,"B","Dualith Noct","GD|DA"],
  ["139",139,"","Anubis","GD"],
  ["140",140,"","Sekhmet","GD"],
  ["141",141,"","Prixter","DA|GD"],
  ["141B",141,"B","Prixter Lux","EL|GD"],
  ["142",142,"","Tetroise","GD"],
  ["142B",142,"B","Tetroise Primo","NE"],
  ["143",143,"","Nyafia","DA"],
  ["144",144,"","Mimog","NE"],
  ["145",145,"","Xenovader","DA"],
  ["146",146,"","Xenogard","DR"],
  ["147",147,"","Prunelia","GR|DA"],
  ["148",148,"","Nitemary","DA"],
  ["148B",148,"B","Nitemary Botan","GR"],
  ["149",149,"","Smokie","DA"],
  ["149B",149,"B","Smokie Cryst","DA|IC"],
  ["150",150,"","Omascul","DA"],
  ["151",151,"","Whalaska","IC|WA"],
  ["151B",151,"B","Whalaska Ignis","IC|FI"],
  ["152",152,"","Verdash","GR"],
  ["153",153,"","Splatterina","DA"],
  ["154",154,"","Gildane","GD"],
  ["155",155,"","Dogen","NE"],
  ["156",156,"","Bulldosu","GD"],
  ["157",157,"","Celesdir","NE"],
  ["157B",157,"B","Celesdir Noct","DA"],
  ["158",158,"","Astegon","DR|DA"],
  ["159",159,"","Knocklem","GD"],
  ["159B",159,"B","Knocklem Ignis","FI"],
  ["160",160,"","Silvegis","DR"],
  ["161",161,"","Azurmane","EL"],
  ["162",162,"","Valentail","NE"],
  ["163",163,"","Snock","EL"],
  ["163B",163,"B","Snock Lux","EL|GD"],
  ["164",164,"","Souffline","GR"],
  ["165",165,"","Lapiron","GD"],
  ["166",166,"","Hoodle","DA"],
  ["167",167,"","Slowatt","EL"],
  ["168",168,"","Bakemi","DA"],
  ["169",169,"","Solmora","WA"],
  ["169B",169,"B","Solmora Lux","WA|EL"],
  ["170",170,"","Lapure","NE"],
  ["171",171,"","Eidrolon","DR|DA"],
  ["171B",171,"B","Eidrolon Ignis","DR|FI"],
  ["172",172,"","Dynamoff","EL"],
  ["173",173,"","Tropicaw","GR"],
  ["174",174,"","Flaracle","FI"],
  ["175",175,"","Ophydia","GR|WA"],
  ["176",176,"","Dupin","FI"],
  ["177",177,"","Roujay","DA"],
  ["178",178,"","Venusa","DA"],
  ["179",179,"","Mycora","GR"],
  ["180",180,"","Loomen","DA|FI"],
  ["181",181,"","Wistella","DA"],
  ["182",182,"","Solenne","DA|NE"],
  ["183",183,"","Renjishi","FI"],
  ["184",184,"","Aegidron","DR|GD"],
  ["185",185,"","Grizzbolt","EL"],
  ["186",186,"","Lyleen","GR"],
  ["186B",186,"B","Lyleen Noct","DA"],
  ["187",187,"","Orserk","DR|EL"],
  ["188",188,"","Faleris","FI"],
  ["188B",188,"B","Faleris Aqua","WA"],
  ["189",189,"","Shadowbeak","DA"],
  ["190",190,"","Selyne","DA|NE"],
  ["191",191,"","Bastigor","IC"],
  ["192",192,"","Shaolong","DR|WA"],
  ["195",195,"","Bellanoir","DA"],
  ["195B",195,"B","Bellanoir Libero","DA"],
  ["196",196,"","Xenolord","DA|DR"],
  ["197",197,"","Hartalis","NE"],
  ["198",198,"","Paladius","NE"],
  ["199",199,"","Necromus","DA"],
  ["200",200,"","Frostallion","IC"],
  ["200B",200,"B","Frostallion Noct","DA"],
  ["201",201,"","Neptilius","WA"],
  ["202",202,"","Jetragon","DR"]
];

var PARTNER_SKILLS_SEED = [
  ["100","Hug Me Please","While in party, +50% damage dealt to enemies afflicted with Ivy-Covered (no stacking)."],
  ["101","Cool Body","Rideable; in party grants the player +2 Heat Resistance (no stacking)."],
  ["102","Grenadier Panda","Rideable; can fire a rapid grenade launcher while mounted."],
  ["103","Wriggling Weasel","Rideable; while mounted, attack type becomes Dragon, +5% Attack."],
  ["104","Flame Wing","Flying mount; while mounted, attack type becomes Fire, +5% Attack."],
  ["105","Magma Overload","Rideable; Attack rises 4% per other Fire or Ground Pal in the party."],
  ["106","Samba Step","Rideable; +155% Move Speed on grass while mounted."],
  ["107","Drill Crusher","When activated, spins in Shell Spin form, following the player with +800% ore-mining efficiency."],
  ["108","Love's First Blossom","Rideable; in party, picked-up Pal Eggs have a 35% chance to become Alpha Eggs (no stacking)."],
  ["109","Soil Improver","In party, Ground-type Pals gain +15% Attack; may drop High Quality Pal Oil on Ranch duty."],
  ["001","Fluffy Shield","Equips as a shield when activated; can drop Wool when placed on Ranch duty."],
  ["002","Cat Helper","While in party, raises the player's carry weight limit by 100 (no stacking)."],
  ["003","Egg Layer","May produce an Egg when placed on Ranch duty."],
  ["004","Lifmunk Recoil","When activated, rides on the player's head and adds SMG fire to attacks."],
  ["005","Surfing Slam","When activated, body-surfs into a target and slams them."],
  ["005B","Fire Tackle","When activated, fire-surfs into a target and slams them."],
  ["006","Dig Here!","May unearth items when placed on Ranch duty."],
  ["007","Zephyr Glider","While in party, upgrades the glider: no fall damage, longer high-speed glides."],
  ["007B","Jolt Glider","While in party, upgrades the glider: no fall damage, longer high-speed glides."],
  ["008","Fluffy Wool","While in party, Neutral-type Pals gain +15% Attack; may drop Wool on Ranch duty."],
  ["009","Leap Stance","When activated, inflates to launch the player skyward; airborne Attack +50% before landing."],
  ["009B","Shadow Stance","Launches the player skyward like Croajiro; party also gets +25% Dark weak-point damage."],
  ["010","Herbil Pulse","While in party, revives the player with 30% max HP when downed."],
  ["011","Soothing Shower","While in party, heals 20% HP when the player drops below 30% (120s cooldown)."],
  ["012","Logging Assistance","While in party, +30% logging speed and -40% wood weight."],
  ["013","Best Boy","While in party, +10% melee weapon damage (no stacking)."],
  ["014","Happy Clover","While at base, +1 Gathering suitability for every other base Pal (no stacking)."],
  ["015","Jolt Bomb","When activated, throws Jolthog at a target for an Electric explosion."],
  ["015B","Cold Bomb","When activated, throws Jolthog Cryst at a target for an Ice explosion."],
  ["016","Caffeine Inoculation","When activated, doubles its own Move and Work Speed; may drop Venom Gland on Ranch duty."],
  ["017","Pengullet Launcher","When activated, fires Pengullet from a rocket launcher; it explodes on impact and is knocked out."],
  ["017B","Pengullet Lux Launcher","When activated, fires Pengullet Lux from a launcher; it explodes on impact and is knocked out."],
  ["018","Brave Sailor","While in party, Fire-type Pals drop 40% more loot when defeated (no stacking)."],
  ["018B","Unyielding Storm Commander","While in party, +25% Water weak-point damage for player and Pals (no stacking)."],
  ["019","Dark Knowledge","While in party, Dark-type Pals gain +15% Attack (no stacking)."],
  ["020","Pacapaca Wool","Rideable; while in party, boosts Kingpaca's Defense and Move Speed; may drop Wool on Ranch duty."],
  ["021","King of Muscles","Rideable; Defense and Move Speed rise 5% per Melpaca in the party."],
  ["021B","Coldhearted King","Rideable; Defense and Move Speed rise 5% per Melpaca in the party."],
  ["022","Dream Chaser","While in party, hovers near the player and fires Dark bolts that can't finish off a target."],
  ["023","Cheery Rifle","When activated, fires an assault rifle at nearby enemies for a short time."],
  ["023B","Chipper Chimp Gunfire","When activated, fires a Fire assault rifle at nearby enemies for a short time."],
  ["024","Kuudere","When activated, reveals nearby Pal Effigy locations."],
  ["025","Magma Tears","While in party, heals player and party 0.1% HP/sec outside combat; may drop Flame Organ on Ranch duty."],
  ["026","Tiny Spark","While in party, Fire-type Pals gain +15% Defense; may drop Flame Organ on Ranch duty."],
  ["027","Gold Digger","May dig up Gold Coin when placed on Ranch duty."],
  ["027B","Icy Whispers","May drop Ice Organ when placed on Ranch duty."],
  ["028","Hard Head","Rideable; while mounted, +500% efficiency breaking Stone."],
  ["029","Huggy Fire","When activated, equips as a flamethrower."],
  ["029B","Huggy Frost","When activated, equips and attacks with freezing air."],
  ["030","Fried Squid","While in party, glider gains gentle extended floating."],
  ["030B","Fried Killamari","While in party, glider gains gentle extended floating."],
  ["031","Mining Assistance","While in party, +30% mining speed and -80% Stone weight."],
  ["032","Guardian of the Forest","Rideable; double-jump while mounted, +220% logging efficiency."],
  ["032B","Guardian of the Golden Forest","Rideable, double-jump while mounted; at base, +1 Lumbering for other base Pals."],
  ["033","Direhowl Rider","Rideable; slightly faster than most mounts."],
  ["034","Berry Picker","May drop Red Berries on Ranch duty; in party, restores 100 hunger to the hungriest Pal every 5 min."],
  ["034B","Venom Picker","May drop Venom Gland on Ranch duty; in party, restores 100 hunger to the hungriest Pal every 5 min."],
  ["035","Fluffy","While in party, boosts Sweepa's Attack and Defense."],
  ["036","King of Fluff","Rideable; Attack and Defense rise 12% per Swee in the party."],
  ["037","Spikey Carrier","While in party, -80% Ore weight (no stacking)."],
  ["037B","Shiny Hauler","While in party, -80% Sulfur/Coal weight and +80% Ground weak-point damage (no stacking)."],
  ["038","Flying Trapeze","While in party, glider gains slow ascension."],
  ["038B","Winter Trapeze","While in party, glider gains slow ascension."],
  ["039","Candy Pop","May drop Cotton Candy on Ranch duty; at base, -10% base Pal hunger drain (no stacking)."],
  ["039B","Bitter Pop","May drop Caramel Cotton Candy on Ranch duty; at base, -15% base Pal hunger drain (no stacking)."],
  ["040","Milk Maker","May drop Milk when placed on Ranch duty."],
  ["041","Waterwing Dance","Water-travel mount; while mounted, attack type becomes Water, +5% Attack."],
  ["041B","Icewing Dance","Water-travel mount; while mounted, attack type becomes Ice, +5% Attack."],
  ["042","Static Electricity","While in party, Electric-type Pals gain +15% Attack; may drop Electric Organ on Ranch duty."],
  ["043","Aqua Spout","While in party, Water-type Pals gain +15% Attack; may drop Aquatic Pal Fluids on Ranch duty."],
  ["043B","Lava Spout","While in party, Fire-type Pals gain +15% Attack; may drop Flame Organ on Ranch duty."],
  ["044","Happy-Go-Lucky Bunny","In party, Neutral Pals +15% Attack; at base, +1 Handiwork for other base Pals."],
  ["044B","Ground 'n' Pound","In party, +25% Grass weak-point damage; +200% efficiency at Weapon Workbench-type stations."],
  ["045","Jelliette Drop","While in party, +55% fishing yield; boosts Jellroy's base watering speed while both are home."],
  ["046","Jellroy Drop","While in party, +55% salvage yield; boosts Jelliette's base watering speed while both are home."],
  ["047","Magical Twin Powers","At base, +1 Watering suitability for other base Pals (no stacking)."],
  ["048","Sticky Princess","While in party, the fishing capture gauge drains 12% slower when bars aren't aligned."],
  ["048B","Cephalo-Princess","While in party, Water-type Pals gain +15% Defense (no stacking)."],
  ["049","Galeclaw Glider","While in party, glider gains high-speed flight and right-hand shooting."],
  ["050","Death-Cheating Feline","While in party, raises capture rate when a back-attack bonus applies."],
  ["051","Travel Companion","Rideable as a flying mount."],
  ["052","Ultrasonic Sensor","When activated, pings nearby dungeons, chests, and scrap."],
  ["053","Eggbomb Launcher","When activated, equips as an egg-firing launcher."],
  ["054","Swift Deity","Rideable; in party, +25% Electric weak-point damage for player and Pals (no stacking)."],
  ["054B","Frigid Deity","Rideable; while mounted, attack type becomes Ice, +5% Attack."],
  ["055","Angry Shark","When activated, attacks with a boosted Aqua Gun; in party, +10% player Attack."],
  ["055B","Angry Shark","When activated, attacks with a boosted Spirit Fire; in party, +10% player Attack."],
  ["056","Dark Gleam Strike","When activated, strikes with a boosted claw attack; +15% melee attack speed in party."],
  ["056B","Frozen Gleam Strike","When activated, strikes with a boosted ice-claw attack; +15% melee attack speed in party."],
  ["057","Eerie Nightstreaker","Toggleable Night Vision; may dig up Bone on Ranch duty."],
  ["058","Warm Body","Rideable; in party grants the player +2 Cold Resistance (no stacking)."],
  ["059","Fluffy Flutterer","While in party, raises capture rate against Frozen targets (no stacking)."],
  ["060","Princess Gaze","While in party, Grass-type Pals gain +15% Attack (no stacking)."],
  ["061","Mysterious Scales","When activated, attacks with Poison Fog; at base, +1 Farming for other base Pals."],
  ["062","Crackle Booster","At base, +1 Generating Electricity suitability for other base Pals (no stacking)."],
  ["063","Amicable Holy Dragon","Flying mount, faster while flying; in party, Dark Pals drop 40% more loot (no stacking)."],
  ["063B","Amicable Water Dragon","Flying mount, faster while flying; in party, -15% Fire damage taken and Burn immunity (no stacking)."],
  ["064","Aerial Marauder","Flying mount; in party, +20% weak-point damage dealt by the player (no stacking)."],
  ["064B","Aerial Marauder","Flying mount; in party, +30% weak-point damage dealt by the player (no stacking)."],
  ["065","Life Steal","While fighting alongside the player, both gain 5% lifesteal on damage dealt."],
  ["066","Purification of Gaia","In party, Ground-type Pals drop 40% more loot; may drop assorted seeds on Ranch duty."],
  ["067","Worker Bee","While in party, boosts Elizabee's Attack; may drop Honey on Ranch duty."],
  ["068","Queen Bee Command","Attack rises 12% per Beegarde in the party."],
  ["069","Heart Drain","While fighting alongside the player, both gain 5% lifesteal on damage dealt."],
  ["070","Glaring Cat's Eye","Rideable; in party, 50% chance of an extra Pal Egg on pickup (no stacking)."],
  ["071","Tarantriss' Web","Rideable, double-jump while mounted; can fire webbing to grapple at high speed."],
  ["072","Rider of the Snowy Mountain","Rideable, +80% Move Speed on snow while mounted; can slide down slopes."],
  ["072B","Snowy Mountain Slider","Rideable, +80% Move Speed on snow while mounted; slope-sliding reaches a very high top speed."],
  ["073","Too Cool to be Seen","When activated, turns itself and the player briefly undetectable to enemies."],
  ["073B","Too Cool to be Seen","When activated, turns itself and the player briefly undetectable to enemies."],
  ["074","Full-Power Gorilla Mode","When activated, +75% Attack for a limited time."],
  ["074B","Full-Power Gorilla Pound","While in party, +50% player climbing speed (no stacking)."],
  ["075","Swift Swimmer","Water-travel mount; may drop Leather on Ranch duty."],
  ["075B","Sand Swimmer","Rideable; in party, player's attacks inflict Muddy 2 (no stacking)."],
  ["076","Grounded Archer","While in party, +10% player bow damage (no stacking)."],
  ["076B","Master Archer","While in party, +15% player bow charge speed (no stacking)."],
  ["077","Helper Bunny","While in party, hovers near the player and auto-collects nearby items."],
  ["078","Lord Fox","When activated, changes the player's attack type to Fire, +30% Attack."],
  ["078B","Black Fox Lord","When activated, changes the player's attack type to Dark, +30% Attack."],
  ["079","Mystical Black Magic","In party, Neutral Pals drop 40% more loot; 10% chance to save a thrown Sphere (no stacking)."],
  ["079B","Blazing Black Magic","At base, +1 Kindling suitability for other base Pals (no stacking)."],
  ["080","Wings of Death","Flying mount; while mounted, attack type becomes Dark, +5% Attack."],
  ["080B","Wings of Thunder","Flying mount; while mounted, attack type becomes Electric, +5% Attack."],
  ["081","Mother Nature's Menace","When activated, changes the player's attack type to Grass, +30% Attack."],
  ["081B","Father Winter's Threat","While in party, lets the player Freeze Soaked enemies in one hit."],
  ["082","Antigravity","While in party, Spheres home in on Pals and carry capacity +300 (no stacking)."],
  ["083","Wind and Clouds","Rideable, double-jump while mounted."],
  ["083B","Stormcloud","Rideable, double-jump while mounted; Water-type Pals drop 40% more loot (no stacking)."],
  ["084","Fragrant Dragon","Rideable; in party, Dragon-type Pals gain +15% Defense (no stacking)."],
  ["084B","Thunder Dragon","Rideable; in party, Electric-type Pals gain +15% Defense (no stacking)."],
  ["085","Brandish Blade","When activated, unleashes a boosted Iaigiri strike."],
  ["085B","Void Blade","When activated, unleashes a boosted Iaigiri strike; +30% melee damage out of combat (no stacking)."],
  ["086","Icy Maw","In party, -30% weight for ingredients/food; paired with another Ice Pal, -30% food rot speed (no stacking)."],
  ["087","Gaia Crusher","Rideable; while mounted, +220% logging and +500% mining efficiency."],
  ["087B","Ice Crusher","Rideable; while mounted, +220% logging and +500% mining efficiency."],
  ["088","Water Gun","When activated, changes the player's attack type to Water, +30% Attack."],
  ["088B","Ember Chamber","In party, -60% weapon weight and +25% Fire weak-point damage (no stacking)."],
  ["089","Blessing of the Flower Spirit","When activated, heals the player 75% HP; at base, +1 Planting for other base Pals."],
  ["089B","Passion of the Flower Spirit","Heals the player 80% HP on activation; in party, -15% Grass damage taken plus immunity to Ivy-Covered."],
  ["090","Selfless Discipline","Attack and Defense rise 2% for every other Grass-type Pal in the party."],
  ["091","Flameclaw Hunter","When activated, unleashes a boosted Hellfire Claw strike."],
  ["091B","Darkclaw Hunter","When activated, unleashes a boosted Nightmare Claw strike."],
  ["092","Lady of Lightning","While in party, hovers near the player firing non-lethal Electric bolts."],
  ["092B","Lady of Dark Lightning","While in party, hovers near the player firing non-lethal Dark bolts."],
  ["093","Red Hare","Rideable; while mounted, attack type becomes Fire, +5% Attack."],
  ["093B","Black Hare","Rideable; while mounted, attack type becomes Dark, +5% Attack."],
  ["094","Hungry Missile","Rideable; can fire a rapid missile launcher while mounted."],
  ["094B","Missile Party","Rideable; can fire a rapid missile launcher while mounted."],
  ["095","Aurora Guide","In party, Ice-type Pals gain +15% Attack; may drop Ice Organ on Ranch duty."],
  ["096","Thunderous","Flying mount; while mounted, attack type becomes Electric, +5% Attack; +5% Move Speed per other Electric party Pal."],
  ["096B","Coldsnap","Flying mount; while mounted, attack type becomes Ice, +5% Attack; +5% Move Speed per other Ice party Pal."],
  ["097","Master of Darkness","Water-travel mount; +5% Move Speed per other Dark or Water Pal in the party."],
  ["097B","Abyssal Celebrity Chef","Water-travel mount; +5% Move Speed per other Fire or Water Pal in the party."],
  ["098","Lightning Shepherd","Rideable, double-jump while mounted; +5% Move Speed per other Electric party Pal."],
  ["098B","Snow Shepherd","Rideable, double-jump while mounted; Ice-type Pals gain +15% Defense in party."],
  ["099","Steel Scorpion","In party, +5% player Defense; Electric-type Pals drop 40% more loot (no stacking)."],
  ["099B","Golden Scorpion","In party, +5% player Defense; Electric-type Pals drop 40% more loot (no stacking)."],
  ["100B","Hug You So Much","While in party, player's attacks inflict Ivy-Covered 2 (no stacking)."],
  ["102B","Grenadier Panda","Rideable; can fire a rapid grenade launcher while mounted."],
  ["103B","Sparkling Weasel","Rideable; while mounted, attack type becomes Fire, +5% Attack."],
  ["105B","Ice Overload","Rideable; in party, +25% Ice weak-point damage (no stacking)."],
  ["108B","Purity's Full Bloom","Rideable; in party, picked-up Pal Eggs have a 45% chance to become Alpha Eggs (no stacking)."],
  ["109B","Golden Harvest","In party, +100% Gold Coin drops from enemies; may drop Pal Oil (and rarely Gold Coin) on Ranch duty."]
];

var TYPES_SEED = [
  ["NE","Neutral"],
  ["FI","Fire"],
  ["WA","Water"],
  ["GR","Grass"],
  ["EL","Electric"],
  ["IC","Ice"],
  ["GD","Ground"],
  ["DA","Dark"],
  ["DR","Dragon"]
];

var PASSIVE_SKILLS_SEED = [
  ["Demon's Hand",5,true,"Work Speed +90%|SAN drains 15% faster|World Tree resources stay put when approached"],
  ["Dimensional Leap",5,true,"Move Speed +50%|Hunger drains 15% faster|World Tree resources stay put when approached"],
  ["God of Destruction",5,true,"Attack +40%|Defense +20%|Max HP -50%|World Tree resources stay put when approached"],
  ["Hermit Sage",5,true,"SAN drains 50% slower|Work Speed -20%|World Tree resources stay put when approached"],
  ["Sanctified Meat Shield",5,true,"Defense +50%|Attack -30%|World Tree resources stay put when approached"],
  ["Twin-Edged Holy Blade",5,true,"Attack +50%|Defense -30%|World Tree resources stay put when approached"],
  ["World Tree Seedbed",5,true,"Hunger drains 50% slower|HP -20%|World Tree resources stay put when approached"],
  ["Babysitter",4,true,"At base: +30% egg production and +30% incubation speed for Breeding Farm Pals"],
  ["Demon God",4,true,"Attack +30%|Defense +5%"],
  ["Diamond Body",4,true,"Defense +30%|Immune to Flinch|Immune to Knockback"],
  ["Eternal Engine",4,true,"Max Stamina +75% (rideable Pals only)"],
  ["Eternal Flame",4,false,"+30% Fire damage|+30% Electric damage"],
  ["Heart of the Immovable King",4,true,"SAN drains 20% slower"],
  ["Heavily Armored",4,true,"Immune to Explosion damage"],
  ["Idiosyncratic",4,true,"Auto HP regen +50%|Defense +25%|Immune to Poison|Immune to Burn"],
  ["Immortality",4,true,"Lifesteal +5%|Auto HP regen +100%|Attack +15%"],
  ["Invader",4,false,"+30% Dark damage|+30% Dragon damage"],
  ["King of the Waves",4,true,"+50% Move Speed on water"],
  ["Lavish Hospitality",4,false,"+100% items dropped"],
  ["Legend",4,false,"Attack +20%|Defense +20%|Move Speed +20%"],
  ["Lightfooted",4,false,"+1 mounted jump count"],
  ["Lucky",4,false,"Attack +15%|Defense +15%|Work Speed +20%"],
  ["Lunker",4,false,"+20% Water damage|+20% Ice damage|+20% Defense"],
  ["Mastery of Fasting",4,true,"Hunger drains 20% slower"],
  ["Ranch Master",4,false,"Farming suitability +2"],
  ["Remarkable Craftsmanship",4,true,"Work Speed +75%"],
  ["Savior",4,false,"+30% Neutral damage|+30% Grass damage"],
  ["Siren of the Void",4,false,"+30% Dark damage|+30% Ice damage"],
  ["Skymarcher",4,true,"+2 mounted jump count"],
  ["Swift",4,true,"+30% Move Speed"],
  ["Vampiric",4,true,"Absorbs a share of damage dealt as healing; never sleeps, keeps working at night"],
  ["Ace Swimmer",3,true,"+40% Move Speed on water"],
  ["Artisan",3,true,"Work Speed +50%"],
  ["Burly Body",3,true,"Defense +20%|Immune to Flinch"],
  ["Celestial Emperor",3,false,"+30% Neutral damage"],
  ["Diet Lover",3,true,"Hunger drains 15% slower"],
  ["Divine Dragon",3,false,"+30% Dragon damage"],
  ["Earth Emperor",3,false,"+30% Ground damage"],
  ["Farmhand",3,false,"Farming suitability +1"],
  ["Ferocious",3,true,"Attack +20%"],
  ["Flame Emperor",3,false,"+30% Fire damage"],
  ["Healing Coach",3,true,"Player auto HP regen +5%"],
  ["Ice Emperor",3,false,"+30% Ice damage"],
  ["Infinite Stamina",3,true,"Max Stamina +50% (rideable Pals only)"],
  ["Logging Foreman",3,true,"+25% player logging efficiency"],
  ["Lord of Lightning",3,false,"+30% Electric damage"],
  ["Lord of the Sea",3,false,"+30% Water damage"],
  ["Lord of the Underworld",3,false,"+30% Dark damage"],
  ["Mine Foreman",3,true,"+25% player mining efficiency"],
  ["Motivational Leader",3,true,"+25% player Work Speed"],
  ["Noble",3,true,"+5% sale value of items"],
  ["Philanthropist",3,true,"+100% breeding speed on a Breeding Farm"],
  ["Reload Master",3,true,"+4% player reload speed"],
  ["Runner",3,true,"+20% Move Speed"],
  ["Serenity",3,true,"Active skill cooldown -30%|Attack +10%"],
  ["Service-Minded",3,false,"+50% items dropped"],
  ["Spirit Emperor",3,false,"+30% Grass damage"],
  ["Stronghold Strategist",3,true,"+10% player Defense"],
  ["Vanguard",3,true,"+10% player Attack"],
  ["Wellness Watcher",3,true,"Player Stamina use -5%"],
  ["Whopper",3,false,"+5% Water damage|+5% Ice damage|+5% Defense"],
  ["Workaholic",3,true,"SAN drains 15% slower"],
  ["Heavyweight",2,false,"Defense +20%|Immune to Knockback"],
  ["Musclehead",2,true,"Attack +30%|Work Speed -50%"],
  ["Abnormal",1,false,"-10% Neutral damage taken"],
  ["Aggressive",1,false,"Attack +10%|Defense -10%"],
  ["Blood of the Dragon",1,false,"+10% Dragon damage"],
  ["Botanical Barrier",1,false,"-10% Grass damage taken"],
  ["Brave",1,true,"Attack +10%"],
  ["Capacitor",1,false,"+10% Electric damage"],
  ["Cheery",1,false,"-10% Dark damage taken"],
  ["Coldblooded",1,false,"+10% Ice damage"],
  ["Conceited",1,false,"Work Speed +10%|Defense -10%"],
  ["Dainty Eater",1,true,"Hunger drains 10% slower"],
  ["Dragonkiller",1,false,"-10% Dragon damage taken"],
  ["Earthquake Resistant",1,false,"-10% Ground damage taken"],
  ["Fine Furs",1,true,"+3% sale value of items"],
  ["Fit as a Fiddle",1,true,"Max Stamina +25% (rideable Pals only)"],
  ["Fragrant Foliage",1,false,"+10% Grass damage"],
  ["Hard Skin",1,true,"Defense +10%"],
  ["Heated Body",1,false,"-10% Ice damage taken"],
  ["Hooligan",1,false,"Attack +15%|Work Speed -10%"],
  ["Hydromaniac",1,false,"+10% Water damage"],
  ["Impatient",1,true,"Active skill cooldown -15%"],
  ["Insomnia",1,true,"Never sleeps, keeps working at night"],
  ["Insulated Body",1,false,"-10% Electric damage taken"],
  ["Masochist",1,false,"Defense +15%|Attack -15%"],
  ["Nimble",1,true,"+10% Move Speed"],
  ["Otherworldly Cells",1,false,"Attack +10%|-15% Fire damage taken|-15% Electric damage taken"],
  ["Positive Thinker",1,true,"SAN drains 10% slower"],
  ["Power of Gaia",1,false,"+10% Ground damage"],
  ["Pyromaniac",1,false,"+10% Fire damage"],
  ["Sadist",1,false,"Attack +15%|Defense -15%"],
  ["Serious",1,true,"Work Speed +20%"],
  ["Sleek Stroke",1,true,"+30% Move Speed on water"],
  ["Spirit of Zen",1,false,"+10% Neutral damage"],
  ["Suntan Lover",1,false,"-10% Fire damage taken"],
  ["Veil of Darkness",1,false,"+10% Dark damage"],
  ["Waterproof",1,false,"-10% Water damage taken"],
  ["Work Slave",1,true,"Work Speed +30%|Attack -30%"],
  ["Clumsy",-1,false,"Work Speed -10%"],
  ["Coward",-1,false,"Attack -10%"],
  ["Downtrodden",-1,false,"Defense -10%"],
  ["Easygoing",-1,false,"Active skill cooldown +15% (longer)"],
  ["Glutton",-1,false,"Hunger drains 10% faster"],
  ["Mercy Hit",-1,true,"Pacifist — attacks never finish off a target"],
  ["Night Owl",-1,false,"Naps through the day despite being nocturnal"],
  ["Shabby",-1,false,"-10% sale value of items"],
  ["Sickly",-1,false,"Max Stamina -25% (rideable Pals only)"],
  ["Unstable",-1,false,"SAN drains 10% faster"],
  ["Bottomless Stomach",-2,false,"Hunger drains 15% faster"],
  ["Destructive",-2,false,"SAN drains 15% faster"],
  ["Brittle",-3,false,"Defense -20%"],
  ["Pacifist",-3,false,"Attack -20%"],
  ["Slacker",-3,false,"Work Speed -30%"]
];

var BREEDING_SHEET_NAME = 'breedingLog';
var BREEDING_HEADERS = [
  'id', 'createdAt',
  'parentA_palId', 'parentA_sex', 'parentA_passives', 'parentA_actives',
  'parentB_palId', 'parentB_sex', 'parentB_passives', 'parentB_actives',
  'offspring_palId', 'offspring_sex', 'offspring_passives', 'offspring_actives',
  'notes'
];

// The 12 Work Suitability types from the base game, in the order the
// game itself lists them. Left blank for every Pal — the app never
// populates these, only adds the columns so they can be filled in by
// hand from a source you trust.
var WORK_SUITABILITY_COLUMNS = [
  'Kindling', 'Watering', 'Planting', 'Generating Electricity', 'Handiwork',
  'Gathering', 'Lumbering', 'Mining', 'Medicine Production', 'Cooling',
  'Transporting', 'Farming'
];

var PALS_SHEET_NAME = 'pals';
var PALS_HEADERS = ['id', 'palId', 'name', 'type', 'imageUrl', 'discovered', 'base', 'party']
  .concat(WORK_SUITABILITY_COLUMNS);

var PARTNER_SKILLS_SHEET_NAME = 'partnerSkills';
var PARTNER_SKILLS_HEADERS = ['id', 'palId', 'palName', 'name', 'description'];

var ACTIVE_SKILLS_SHEET_NAME = 'activeSkills';
var ACTIVE_SKILLS_HEADERS = ['id', 'name', 'element', 'power', 'ct', 'exclusive', 'description', 'notes'];

var ELEMENTS_SHEET_NAME = 'elements';
var ELEMENTS_HEADERS = ['id', 'code', 'name', 'imageUrl'];

var PASSIVE_SKILLS_SHEET_NAME = 'passiveSkills';
var PASSIVE_SKILLS_HEADERS = ['id', 'name', 'rank', 'surgery', 'effects', 'unlocked'];

/* ============================================================
   GENERIC HELPERS
   ============================================================ */
function getSecret_() {
  return PropertiesService.getScriptProperties().getProperty('SECRET') || '';
}

function checkSecret_(secret) {
  var expected = getSecret_();
  return !!expected && secret === expected;
}

// Bumped on every change to this file. Stamped on every response (even
// errors) so it's obvious from the outside whether a live deployment is
// actually running this version — editing the code in the Apps Script
// editor does NOT update what's live until you redeploy (see header
// comment), which is easy to think you did and not have actually done.
var SCRIPT_BUILD = '2026-08-13.1';

function jsonOut_(obj) {
  obj._build = SCRIPT_BUILD;
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

// Exact match, case-insensitive — every read/write below looks columns
// up by name through this, never by fixed position.
function headerIndex_(header, name) {
  var lower = header.map(function (h) { return String(h || '').toLowerCase().trim(); });
  return lower.indexOf(String(name).toLowerCase());
}

function isTruthyCell_(v) {
  if (v === true) return true;
  var s = String(v || '').trim().toLowerCase();
  return s === 'yes' || s === 'y' || s === 'true' || s === '1' || s === 'x';
}

// A "multi-value" cell may be comma- or pipe-separated: our own writes
// use "|", but a Sheets multi-select dropdown column auto-joins with
// ", " — tolerate both on every read so it doesn't matter which one
// produced the cell.
function splitMulti_(v) {
  if (!v) return [];
  return String(v).split(/[|,]/).map(function (s) { return s.trim(); }).filter(function (s) { return s; });
}

function padPalId_(n) {
  var s = String(n);
  while (s.length < 3) s = '0' + s;
  return s;
}

// A palId cell may legitimately be a real number in the sheet (e.g.
// formatted with a custom number format like "000" so it displays
// zero-padded) rather than a text string — that's the actual cell
// type the person chose, not something to "fix." This never writes
// anything back to the sheet; it just normalizes whatever's there
// into the "001"-style string the app matches on, in memory, on read.
function normalizePalId_(v) {
  if (typeof v === 'number') return padPalId_(v);
  return String(v || '');
}

// Additively appends any of columnNames not already present in the
// sheet's header row, in order, at the end — never renames, reorders,
// or touches an existing column. Same pattern as the one-off
// 'unlocked' migration in getPassiveSkillsSheet_, generalized so it
// can add several columns at once.
function ensureHeaderColumns_(sheet, columnNames) {
  var lastCol = sheet.getLastColumn();
  var header = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  columnNames.forEach(function (name) {
    if (headerIndex_(header, name) === -1) {
      lastCol++;
      sheet.getRange(1, lastCol).setValue(name);
      header.push(name);
    }
  });
}

function getSheetOrCreate_(name, headers, seedRows) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
    sheet.appendRow(headers);
    if (seedRows && seedRows.length) {
      sheet.getRange(2, 1, seedRows.length, headers.length).setValues(seedRows);
    }
  }
  return sheet;
}

/* ============================================================
   breedingLog — fully owned by the app
   ============================================================ */
function getBreedingSheet_() {
  return getSheetOrCreate_(BREEDING_SHEET_NAME, BREEDING_HEADERS, []);
}

function rowToEntry_(row, header) {
  function get(name) {
    var i = headerIndex_(header, name);
    return i === -1 ? '' : row[i];
  }
  return {
    id: String(get('id') || ''),
    createdAt: String(get('createdAt') || ''),
    parentA: {
      palId: normalizePalId_(get('parentA_palId')), sex: String(get('parentA_sex') || ''),
      passives: splitMulti_(get('parentA_passives')), actives: splitMulti_(get('parentA_actives'))
    },
    parentB: {
      palId: normalizePalId_(get('parentB_palId')), sex: String(get('parentB_sex') || ''),
      passives: splitMulti_(get('parentB_passives')), actives: splitMulti_(get('parentB_actives'))
    },
    offspring: {
      palId: normalizePalId_(get('offspring_palId')), sex: String(get('offspring_sex') || ''),
      passives: splitMulti_(get('offspring_passives')), actives: splitMulti_(get('offspring_actives'))
    },
    notes: String(get('notes') || '')
  };
}

function entryToRow_(e, header) {
  var pa = e.parentA || {}, pb = e.parentB || {}, off = e.offspring || {};
  var map = {
    id: e.id, createdAt: e.createdAt,
    parentA_palId: pa.palId || '', parentA_sex: pa.sex || '',
    parentA_passives: (pa.passives || []).join('|'), parentA_actives: (pa.actives || []).join('|'),
    parentB_palId: pb.palId || '', parentB_sex: pb.sex || '',
    parentB_passives: (pb.passives || []).join('|'), parentB_actives: (pb.actives || []).join('|'),
    offspring_palId: off.palId || '', offspring_sex: off.sex || '',
    offspring_passives: (off.passives || []).join('|'), offspring_actives: (off.actives || []).join('|'),
    notes: e.notes || ''
  };
  return header.map(function (h) { return map.hasOwnProperty(h) ? map[h] : ''; });
}

function findRowIndexById_(sheet, header, id) {
  var idCol = headerIndex_(header, 'id');
  if (idCol === -1) idCol = 0;
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return -1;
  var ids = sheet.getRange(2, idCol + 1, lastRow - 1, 1).getValues();
  for (var i = 0; i < ids.length; i++) {
    if (String(ids[i][0]) === id) return i + 2;
  }
  return -1;
}

/* ============================================================
   pals — id, palId, name, type, imageUrl, discovered
   ============================================================ */
function getPalsSheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(PALS_SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(PALS_SHEET_NAME);
    sheet.appendRow(PALS_HEADERS);
    var rows = PALS_SEED.map(function (p, i) {
      var row = [i + 1, p[0], p[3], p[4].split('|').join(', '), '', ''];
      while (row.length < PALS_HEADERS.length) row.push('');
      return row;
    });
    sheet.getRange(2, 1, rows.length, PALS_HEADERS.length).setValues(rows);
  } else {
    ensureHeaderColumns_(sheet, ['base', 'party'].concat(WORK_SUITABILITY_COLUMNS));
  }
  return sheet;
}

function readPals_() {
  var sheet = getPalsSheet_();
  var values = sheet.getDataRange().getValues();
  if (values.length < 2) return [];
  var header = values[0];
  var cId = headerIndex_(header, 'palId'), cName = headerIndex_(header, 'name'),
    cType = headerIndex_(header, 'type'), cImg = headerIndex_(header, 'imageUrl'),
    cDisc = headerIndex_(header, 'discovered'), cBase = headerIndex_(header, 'base'),
    cParty = headerIndex_(header, 'party');
  var workCols = WORK_SUITABILITY_COLUMNS.map(function (name) {
    return { name: name, idx: headerIndex_(header, name) };
  });
  var out = [];
  for (var i = 1; i < values.length; i++) {
    var row = values[i];
    if (cId === -1 || !row[cId]) continue;
    var workSuitability = {};
    workCols.forEach(function (c) {
      if (c.idx !== -1 && row[c.idx] !== '') workSuitability[c.name] = row[c.idx];
    });
    out.push({
      id: normalizePalId_(row[cId]),
      name: cName !== -1 ? String(row[cName] || '') : '',
      types: cType !== -1 ? splitMulti_(row[cType]) : [],
      imageUrl: cImg !== -1 ? String(row[cImg] || '') : '',
      discovered: cDisc !== -1 ? isTruthyCell_(row[cDisc]) : false,
      base: cBase !== -1 ? isTruthyCell_(row[cBase]) : false,
      party: cParty !== -1 ? isTruthyCell_(row[cParty]) : false,
      workSuitability: workSuitability
    });
  }
  return out;
}

function findPalRow_(sheet, header, palId) {
  var idCol = headerIndex_(header, 'palId');
  if (idCol === -1) return -1;
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return -1;
  var ids = sheet.getRange(2, idCol + 1, lastRow - 1, 1).getValues();
  for (var i = 0; i < ids.length; i++) {
    if (normalizePalId_(ids[i][0]) === palId) return i + 2;
  }
  return -1;
}

function setPalField_(palId, fieldName, value) {
  var sheet = getPalsSheet_();
  var header = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  var colIdx = headerIndex_(header, fieldName);
  if (colIdx === -1) return false;
  var rowIdx = findPalRow_(sheet, header, palId);
  if (rowIdx === -1) return false;
  sheet.getRange(rowIdx, colIdx + 1).setValue(value);
  return true;
}

function setDiscovered_(palId, discovered) { return setPalField_(palId, 'discovered', discovered ? 'Yes' : ''); }
function setPalImageUrl_(palId, imageUrl) { return setPalField_(palId, 'imageUrl', imageUrl || ''); }
function setPalBase_(palId, inBase) { return setPalField_(palId, 'base', inBase ? 'Yes' : ''); }
function setPalParty_(palId, inParty) { return setPalField_(palId, 'party', inParty ? 'Yes' : ''); }

function clearPalsColumn_(colName) {
  var sheet = getPalsSheet_();
  var header = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  var col = headerIndex_(header, colName);
  if (col === -1) return;
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return;
  var blanks = [];
  for (var i = 0; i < lastRow - 1; i++) blanks.push(['']);
  sheet.getRange(2, col + 1, blanks.length, 1).setValues(blanks);
}
function clearAllDiscovered_() { clearPalsColumn_('discovered'); }
function clearAllBase_() { clearPalsColumn_('base'); }
function clearAllParty_() { clearPalsColumn_('party'); }

/* ============================================================
   partnerSkills — its own tab: id, palId, palName, name, description
   ============================================================ */
function palNameLookup_() {
  var map = {};
  PALS_SEED.forEach(function (p) { map[p[0]] = p[3]; });
  return map;
}

function getPartnerSkillsSheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(PARTNER_SKILLS_SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(PARTNER_SKILLS_SHEET_NAME);
    sheet.appendRow(PARTNER_SKILLS_HEADERS);
    var names = palNameLookup_();
    var rows = PARTNER_SKILLS_SEED.map(function (p, i) { return [i + 1, p[0], names[p[0]] || '', p[1], p[2]]; });
    sheet.getRange(2, 1, rows.length, PARTNER_SKILLS_HEADERS.length).setValues(rows);
  }
  return sheet;
}

function readPartnerSkills_() {
  var sheet = getPartnerSkillsSheet_();
  var values = sheet.getDataRange().getValues();
  if (values.length < 2) return [];
  var header = values[0];
  var cPal = headerIndex_(header, 'palId'), cName = headerIndex_(header, 'name'), cDesc = headerIndex_(header, 'description');
  var out = [];
  for (var i = 1; i < values.length; i++) {
    var row = values[i];
    if (cPal === -1 || !row[cPal]) continue;
    var name = cName !== -1 ? String(row[cName] || '') : '';
    if (!name) continue;
    out.push({ palId: normalizePalId_(row[cPal]), name: name, description: cDesc !== -1 ? String(row[cDesc] || '') : '' });
  }
  return out;
}

/* ============================================================
   activeSkills — you populate this; only 'name' is required
   ============================================================ */
function getActiveSkillsSheet_() {
  return getSheetOrCreate_(ACTIVE_SKILLS_SHEET_NAME, ACTIVE_SKILLS_HEADERS, []);
}

function readActiveSkills_() {
  var sheet = getActiveSkillsSheet_();
  var values = sheet.getDataRange().getValues();
  if (values.length < 2) return [];
  var header = values[0];
  var cName = headerIndex_(header, 'name'), cEl = headerIndex_(header, 'element'),
    cPow = headerIndex_(header, 'power'), cCt = headerIndex_(header, 'ct'),
    cExcl = headerIndex_(header, 'exclusive'), cDesc = headerIndex_(header, 'description'),
    cNotes = headerIndex_(header, 'notes');
  var out = [];
  for (var i = 1; i < values.length; i++) {
    var row = values[i];
    if (cName === -1 || !row[cName]) continue;
    out.push({
      name: String(row[cName]),
      element: cEl !== -1 ? splitMulti_(row[cEl]) : [],
      power: cPow !== -1 ? String(row[cPow] || '') : '',
      ct: cCt !== -1 ? String(row[cCt] || '') : '',
      exclusive: cExcl !== -1 ? splitMulti_(row[cExcl]) : [],
      description: cDesc !== -1 ? String(row[cDesc] || '') : (cNotes !== -1 ? String(row[cNotes] || '') : '')
    });
  }
  return out;
}

/* ============================================================
   elements — id, code, name, imageUrl
   ============================================================ */
function getElementsSheet_() {
  var seedRows = TYPES_SEED.map(function (t, i) { return [i + 1, t[0], t[1], '']; });
  return getSheetOrCreate_(ELEMENTS_SHEET_NAME, ELEMENTS_HEADERS, seedRows);
}

function readElements_() {
  var sheet = getElementsSheet_();
  var values = sheet.getDataRange().getValues();
  if (values.length < 2) return [];
  var header = values[0];
  var cCode = headerIndex_(header, 'code'), cName = headerIndex_(header, 'name'), cImg = headerIndex_(header, 'imageUrl');
  var out = [];
  for (var i = 1; i < values.length; i++) {
    var row = values[i];
    if (cCode === -1 || !row[cCode]) continue;
    out.push({ code: String(row[cCode]), name: cName !== -1 ? String(row[cName] || '') : '', imageUrl: cImg !== -1 ? String(row[cImg] || '') : '' });
  }
  return out;
}

/* ============================================================
   passiveSkills — id, name, rank, surgery, effects, unlocked
   'unlocked' is the one column this script adds to an existing
   tab if it's missing, purpose-built for tracking which passives
   you've discovered — appended at the end, nothing else touched.
   ============================================================ */
function getPassiveSkillsSheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(PASSIVE_SKILLS_SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(PASSIVE_SKILLS_SHEET_NAME);
    sheet.appendRow(PASSIVE_SKILLS_HEADERS);
    var rows = PASSIVE_SKILLS_SEED.map(function (p, i) { return [i + 1, p[0], p[1], p[2] ? 'Yes' : '', p[3], '']; });
    sheet.getRange(2, 1, rows.length, PASSIVE_SKILLS_HEADERS.length).setValues(rows);
    return sheet;
  }
  var lastCol = sheet.getLastColumn();
  var header = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  if (headerIndex_(header, 'unlocked') === -1) {
    sheet.getRange(1, lastCol + 1).setValue('unlocked');
  }
  return sheet;
}

function readPassiveSkills_() {
  var sheet = getPassiveSkillsSheet_();
  var values = sheet.getDataRange().getValues();
  if (values.length < 2) return [];
  var header = values[0];
  var cName = headerIndex_(header, 'name'), cRank = headerIndex_(header, 'rank'),
    cSurg = headerIndex_(header, 'surgery'), cEff = headerIndex_(header, 'effects'),
    cUnlock = headerIndex_(header, 'unlocked');
  var out = [];
  for (var i = 1; i < values.length; i++) {
    var row = values[i];
    if (cName === -1 || !row[cName]) continue;
    out.push({
      name: String(row[cName]),
      rank: cRank !== -1 ? (Number(row[cRank]) || 0) : 0,
      surgery: cSurg !== -1 ? isTruthyCell_(row[cSurg]) : false,
      effects: cEff !== -1 ? splitMulti_(row[cEff]) : [],
      unlocked: cUnlock !== -1 ? isTruthyCell_(row[cUnlock]) : false
    });
  }
  return out;
}

function setPassiveUnlocked_(name, unlocked) {
  var sheet = getPassiveSkillsSheet_();
  var header = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  var nameCol = headerIndex_(header, 'name');
  var unlockCol = headerIndex_(header, 'unlocked');
  if (nameCol === -1 || unlockCol === -1) return false;
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return false;
  var names = sheet.getRange(2, nameCol + 1, lastRow - 1, 1).getValues();
  for (var i = 0; i < names.length; i++) {
    if (String(names[i][0]) === name) {
      sheet.getRange(i + 2, unlockCol + 1).setValue(unlocked ? 'Yes' : '');
      return true;
    }
  }
  return false;
}

function clearAllPassivesUnlocked_() {
  var sheet = getPassiveSkillsSheet_();
  var header = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  var unlockCol = headerIndex_(header, 'unlocked');
  if (unlockCol === -1) return;
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return;
  var blanks = [];
  for (var i = 0; i < lastRow - 1; i++) blanks.push(['']);
  sheet.getRange(2, unlockCol + 1, blanks.length, 1).setValues(blanks);
}

/* ============================================================
   HTTP entry points
   ============================================================ */
function doGet(e) {
  if (!checkSecret_(e.parameter.secret)) {
    return jsonOut_({ ok: false, error: 'Unauthorized — the SECRET sent by the app does not match this deployment\'s Script Property.' });
  }
  try {
    var sheet = getBreedingSheet_();
    var values = sheet.getDataRange().getValues();
    var header = values[0];
    var rows = values.slice(1).filter(function (r) { return r.some(function (c) { return c !== '' && c !== null; }); });
    var entries = rows.map(function (r) { return rowToEntry_(r, header); });
    return jsonOut_({
      ok: true,
      entries: entries,
      pals: readPals_(),
      partnerSkills: readPartnerSkills_(),
      activeSkills: readActiveSkills_(),
      elements: readElements_(),
      passiveSkills: readPassiveSkills_()
    });
  } catch (err) {
    return jsonOut_({ ok: false, error: 'Sheet error: ' + err.message });
  }
}

function doPost(e) {
  var body;
  try {
    body = JSON.parse(e.postData.contents);
  } catch (err) {
    return jsonOut_({ ok: false, error: 'Bad request' });
  }
  if (!checkSecret_(body.secret)) {
    return jsonOut_({ ok: false, error: 'Unauthorized — the SECRET sent by the app does not match this deployment\'s Script Property.' });
  }

  try {
    if (body.action === 'setDiscovered') { setDiscovered_(body.payload.palId, body.payload.discovered); return jsonOut_({ ok: true }); }
    if (body.action === 'setDiscoveredBatch') { (body.payload.palIds || []).forEach(function (id) { setDiscovered_(id, true); }); return jsonOut_({ ok: true }); }
    if (body.action === 'clearDiscovered') { clearAllDiscovered_(); return jsonOut_({ ok: true }); }
    if (body.action === 'setPalImageUrl') { setPalImageUrl_(body.payload.palId, body.payload.imageUrl); return jsonOut_({ ok: true }); }
    if (body.action === 'setBase') { setPalBase_(body.payload.palId, body.payload.base); return jsonOut_({ ok: true }); }
    if (body.action === 'setBaseBatch') { (body.payload.palIds || []).forEach(function (id) { setPalBase_(id, true); }); return jsonOut_({ ok: true }); }
    if (body.action === 'clearBase') { clearAllBase_(); return jsonOut_({ ok: true }); }
    if (body.action === 'setParty') { setPalParty_(body.payload.palId, body.payload.party); return jsonOut_({ ok: true }); }
    if (body.action === 'setPartyBatch') { (body.payload.palIds || []).forEach(function (id) { setPalParty_(id, true); }); return jsonOut_({ ok: true }); }
    if (body.action === 'clearParty') { clearAllParty_(); return jsonOut_({ ok: true }); }
    if (body.action === 'setPassiveUnlocked') { setPassiveUnlocked_(body.payload.name, body.payload.unlocked); return jsonOut_({ ok: true }); }
    if (body.action === 'setPassiveUnlockedBatch') { (body.payload.names || []).forEach(function (n) { setPassiveUnlocked_(n, true); }); return jsonOut_({ ok: true }); }
    if (body.action === 'clearPassivesUnlocked') { clearAllPassivesUnlocked_(); return jsonOut_({ ok: true }); }

    var sheet = getBreedingSheet_();
    var header = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];

    if (body.action === 'add') {
      sheet.appendRow(entryToRow_(body.payload, header));
      return jsonOut_({ ok: true });
    }

    if (body.action === 'update') {
      var idx = findRowIndexById_(sheet, header, body.payload.id);
      var row = entryToRow_(body.payload, header);
      if (idx === -1) sheet.appendRow(row);
      else sheet.getRange(idx, 1, 1, row.length).setValues([row]);
      return jsonOut_({ ok: true });
    }

    if (body.action === 'delete') {
      var delIdx = findRowIndexById_(sheet, header, body.payload.id);
      if (delIdx !== -1) sheet.deleteRow(delIdx);
      return jsonOut_({ ok: true });
    }

    return jsonOut_({ ok: false, error: 'Unknown action' });
  } catch (err) {
    return jsonOut_({ ok: false, error: 'Sheet error: ' + err.message });
  }
}
