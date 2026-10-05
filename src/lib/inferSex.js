// src/lib/inferSex.js
// Decides the salutation ("Mr" / "Ms") for the Medical Certificate.
//
// 1) If the student's profile has a usable sex/gender value, that always wins.
// 2) If it's missing ("-", empty, etc.), guess from the FIRST NAME (common
//    Filipino + international names, plus a few safe spelling rules).
// 3) If the name is unisex/unknown, return "Mr./Ms." instead of guessing wrong.

const FEMALE = new Set(`
angela angel angelica angelika angelie angelyn angeline ann anne annie anna annabelle annalyn annalou analyn analiza analie andrea aileen aira airah aika alyssa alyssah alexa alexis alexandra alona alma althea amanda amber amelia amy ana anabel anabelle angie anita antoinette apple april arianne ariane ariel arlene ashley audrey aubrey ava aya ayesha
babylyn bea beatrice beatriz bella belle bernadette bernadeth beth bettina bianca bea blessie bridget bianca
camille camila carla carmela carmen carol carolyn caroline cassandra catherine catalina cathy cecilia celine celestine charlene charlotte charmaine cheche chelsea chelsie cherry cherylyn cheryl cherie chloe christelle christina christine christy cindy claire clarisse clarissa claudia clea colleen corazon cristina cynthia
daisy dana danica danielle daphne darlene dayanara deborah debbie denise desiree diana diane diane dianne dolores donna dorothy
edna eileen elaine elena eliza elizabeth ella ellen elle elsa elvira emily emma erica erika erin esperanza estela esther eunice eva evangeline eve evelyn
faith fatima fe felicia fiona flor florence francesca frances francine
gabrielle gail gemma genevieve georgia gerlie gina gladys glaiza glenda gloria grace gracia gretchen guadalupe gwen gwyneth
hannah hazel heather heidi helen helena hannah hilda hope
ianne irene iris irish isabel isabela isabella ivy iza izabella
jacqueline jade jamaica jane janella janelle janet janice jasmine jassy jazel jazmine jean jeanette jeanne jennifer jenny jenelyn jennylyn jessa jessica jessie jewel jill jillian joan joana joanna joanne jocelyn jodi johanna jolina jona joy joyce judith judy julia juliana julie juliet juliette june justine
kaila kailey kaye kate katelyn katherine kathleen kathryn kathy katrina kayla kaycee kelly kendra kerstin keziah kiara kimberly kristel kristine kristina krizia krizelle krystal
lara larissa laura lauren lea leah leanne leslie lhea liana libby lilian lily lina linda lisa liza lizette lorraine lorena lourdes lovely luisa luz lyka lyn lynn lynette
madeline maddie mae maeve maia maica maika maja malou mara marcela margarita margaret maria mariah mariel marian marianne maribel maricar maricel marie marilou marilyn marites marivic marj marjorie marlene marlyn martha mary maryjane maryrose matilda maureen maxine may maya mayumi megan melanie melissa mercedes mercy meryl mia michaela michelle mika mikaela milagros mildred mirasol mitzi monica monique myra myrna
nadine naomi nancy natalie natasha nathalie nena nerissa nicole nicolette nina noreen norma nora noelle
olga olivia
pamela patricia paula pauline pearl perlita phoebe pia precious princess priscilla pura
queenie quennie
rachel rachelle raquel rebecca regina rhea rhodora rica ricci rina rissa rita roberta rochelle romina ronalyn rosalie rosalinda rosalyn rosario rose rosemarie roselyn rosella rowena roxanne ruby ruth
sabrina sally samantha sandra sandy sara sarah sasha savannah selena selina serena shaina shaira shane sharon sheila shella shelly sheena sherry sherlyn shiela shirley sofia sonia sophia sophie stacey stacy stefanie stella stephanie suzette sofia summer susan susana sylvia
tamara tanya tara tatiana teresa teresita tess tessa thea theresa tiffany tina trisha trixie
ursula
valerie vanessa vera verna veronica vicky victoria vilma vina violet virginia vivian
wendy whitney wilma
xandra xyra
yasmin yvette yvonne
zaira zandra zara zeny zia zoe zyra
`.split(/\s+/).filter(Boolean));

const MALE = new Set(`
aaron abel adam adrian aiden alan albert alberto alden alejandro alex alexander alfred alfredo allan almario alvin andres andrew angelo anthony antonio archie arman armando arnel arnold aron arthur arvin ashton augusto
benedict benjamin benito bernard bernardo billy bobby brandon brian bryan bruce
caleb carl carlo carlos cedric cesar charles charlie christian christopher clarence clark clifford clyde conrad cris cristian cristopher
dan daniel danilo dante darius darwin dave david dennis derek dexter diego dominic dominick donald dwight
eddie edgar edmund eduardo edward edwin efren elias elmer emmanuel enrique eric erick ernest ernesto ethan eugene ezekiel ezra
felix fernando francis francisco frank franklin fred freddie
gabriel garry gary gene geoffrey george gerald gerard gilbert gino glenn gregory gerardo
harold harry harvey hector henry herbert hernan hugo
ian ismael ivan
jacob jaime jake james jason jasper jay jayson jeffrey jeff jerome jerry jesse jesus jethro jim jimmy joel joey john johnny johnrey jon jonathan jonas jordan jorge jose joseph josh joshua josiah juan julian julius justin
karl keith ken kenneth kennedy kevin kurt kyle
lance larry lawrence leo leonard leonardo leopoldo lester lex lloyd lorenzo louie louis lucas luis luke
manuel marc marco marcus mario mark martin marvin matthew mateo mauricio max melvin michael miguel mike mikhael milo mitchell
nathan nathaniel neil nelson nestor nicholas nico nicolas noel norman norberto
oliver oscar oswald owen
pablo patrick paul paulo pedro peter philip phillip
quincy
rafael ralph ramon ramil randy raphael raul ray raymond reggie reinier renato rene reuben rex rey reynaldo ricardo richard rico ricky rob robert roberto robin rodel roderick rodolfo rodrigo roel roger roland rolando romeo ronald ronnie ronel rosendo ross roy ruben russell ryan
salvador sam samuel santiago saul scott sean sebastian sergio seth shawn simon stanley stephen steven
tarsicio ted teddy terrence theodore thomas timothy tito tobias tom tomas tony travis trevor tristan troy
ulysses
valentino vicente victor vincent virgilio
wally walter warren wayne wendell wesley wilfredo will william willie wilson winston
xavier
zachary zack
`.split(/\s+/).filter(Boolean));

// Names that are genuinely used by both sexes — never guess these.
const UNISEX = new Set(
  "alex ariel jan jean jamie jessie jody kim chris cris kris dana robin sam sandy shane terry jay jem jen jhen charlie billy bobby gene lee mel nicky pat tommy angel jun jonas ronnie bernie jess noel jade ash ashley casey cj dj jc jm jr".split(" ")
);

// Male names that happen to end in "a" — so the "-a => female" rule skips them.
const MALE_A = new Set(["joshua", "elijah", "isaiah", "jonah", "noah", "luca", "nikita", "joshuah", "jeremiah", "josiah", "zacharia", "mica", "ezra", "kaleba", "barnaba", "andrea_m", "sasha_m"]);

const SUFFIXES = new Set(["jr", "sr", "ii", "iii", "iv", "v"]);

function normalizeSex(value) {
  const v = String(value ?? "").trim().toLowerCase();
  if (["female", "f", "babae", "woman", "girl"].includes(v)) return "Female";
  if (["male", "m", "lalaki", "man", "boy"].includes(v)) return "Male";
  return null;
}

// "Reyes, Angela Marie D." -> ["angela", "marie"]; "Angela Marie D. Reyes" -> ["angela", "marie", "reyes"]
function givenNameTokens(fullName = "") {
  const name = String(fullName).trim();
  const hasComma = name.includes(",");
  const given = hasComma ? name.split(",").slice(1).join(" ") : name;
  return given
    .toLowerCase()
    .replace(/[.]/g, " ")
    .split(/[\s-]+/)
    .map((t) => t.replace(/[^a-zñ]/g, ""))
    .filter((t) => t.length > 1 && !SUFFIXES.has(t));
}

function scoreToken(token) {
  if (UNISEX.has(token)) return 0;
  if (FEMALE.has(token)) return 1;
  if (MALE.has(token)) return -1;
  // Spelling rules for names not in the lists (conservative).
  if (/(lyn|lynn|elle|ette|issa|ella|anne|ina|ita|ica)$/.test(token)) return 0.6;
  if (/a$/.test(token) && !MALE_A.has(token) && token.length >= 4) return 0.5;
  if (/(o|ito|ardo|berto|son|ton)$/.test(token) && token.length >= 4) return -0.5;
  return 0;
}

/** Returns "Female", "Male", or null when it can't tell. */
export function inferSexFromName(fullName) {
  const tokens = givenNameTokens(fullName);
  if (!tokens.length) return null;
  // "Ma." / "Ma" / "Maria" in front of a name is a Filipino female prefix.
  if (tokens[0] === "ma") return "Female";
  // The first given name carries the most weight; later ones only break ties.
  let total = 0;
  tokens.slice(0, 3).forEach((t, i) => {
    total += scoreToken(t) * (i === 0 ? 2 : 1);
  });
  if (total >= 1) return "Female";
  if (total <= -1) return "Male";
  return null;
}

/**
 * Salutation for the certificate: "Ms", "Mr", or "Mr./Ms." when unknown.
 * Profile sex/gender wins; the name is only used when it's missing.
 */
export function salutationFor(sex, fullName) {
  const known = normalizeSex(sex) || inferSexFromName(fullName);
  if (known === "Female") return "Ms";
  if (known === "Male") return "Mr";
  return "Mr./Ms.";
}

/** Sex text for the certificate sentence — only what's really on file, never a guess. */
export function sexLabel(sex) {
  return normalizeSex(sex) || "____";
}
