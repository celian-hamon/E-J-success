// One-off import: the "Nutrition & énergie (1re STAV)" course and its 3 quizzes, written
// from the teacher's PDFs (glucides, énergie thermique, de l'aliment aux nutriments).
// Run: npx tsx --env-file=.env scripts/import-stav-course.mts   (safe to run twice)
import { copyFile, mkdir, readdir } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

type Q = { prompt: string; choices: string[]; correct: number; explanation: string; wrong: string };
type QuizDef = {
  title: string;
  description: string;
  pdf: string; // start of the file name in Downloads
  mode: string;
  secondsPerQuestion: number;
  difficulty: string;
  combo: boolean;
  lives: number | null;
  questions: Q[];
};

const QUIZZES: QuizDef[] = [
  {
    title: "Les glucides",
    description: "Oses, osides, classification et réactions caractéristiques des glucides.",
    pdf: "Physique glucides",
    mode: "classic",
    secondsPerQuestion: 30,
    difficulty: "medium",
    combo: true,
    lives: null,
    questions: [
      {
        prompt: "Quelle est la formule brute du glucose ?",
        choices: ["C₆H₁₂O₆", "C₁₂H₂₂O₁₁", "(C₆H₁₀O₅)ₙ", "C₅H₁₀O₅"],
        correct: 0,
        explanation: "Le glucose est un ose à 6 atomes de carbone (hexose) de formule C₆H₁₂O₆.",
        wrong: "C₁₂H₂₂O₁₁ est la formule d’un diholoside (saccharose, maltose…) et (C₆H₁₀O₅)ₙ celle d’un polyholoside comme l’amidon. Un ose à 6 C s’écrit CₙH₂ₙOₙ avec n = 6.",
      },
      {
        prompt: "Qu’est-ce qui différencie un ose d’un oside ?",
        choices: [
          "Un ose n’est pas hydrolysable, un oside l’est",
          "Un ose contient de l’azote, pas un oside",
          "Un oside ne possède qu’un seul atome de carbone",
          "Un ose est toujours non réducteur",
        ],
        correct: 0,
        explanation: "Les oses (sucres simples) ne peuvent pas être « cassés » par hydrolyse ; les osides (sucres complexes) le sont tous et libèrent des oses.",
        wrong: "Le critère de classification est l’hydrolyse : on ne peut pas casser un ose en deux, alors qu’un oside est issu de la condensation de plusieurs oses.",
      },
      {
        prompt: "Un ose à 6 atomes de carbone qui possède une fonction cétone est un…",
        choices: ["cétohexose", "aldohexose", "cétopentose", "aldopentose"],
        correct: 0,
        explanation: "Fonction cétone → « céto- », 6 carbones → « -hexose ». Exemple : le fructose.",
        wrong: "« Aldo- » correspond à une fonction aldéhyde (en bout de chaîne) et « pent- » à 5 carbones. Cétone + 6 C donne un cétohexose, comme le fructose.",
      },
      {
        prompt: "Le glucose est…",
        choices: ["un aldohexose", "un cétohexose", "un aldopentose", "un diholoside"],
        correct: 0,
        explanation: "Le glucose possède une fonction aldéhyde et 6 atomes de carbone : c’est un aldohexose.",
        wrong: "C’est le fructose qui est un cétohexose. Le glucose porte une fonction aldéhyde (–CHO) sur son premier carbone.",
      },
      {
        prompt: "Combien d’oses compose un oligoholoside ?",
        choices: ["Entre 2 et 10", "Plus de 10", "Un seul", "Exactement 20"],
        correct: 0,
        explanation: "Oligoholosides : 2 ≤ n ≤ 10 oses (ex. maltose, lactose, saccharose). Au-delà de 10, ce sont des polyholosides.",
        wrong: "« Oligo » signifie « peu » : 2 à 10 oses. Plus de 10 oses, c’est un polyholoside (amidon, cellulose, glycogène).",
      },
      {
        prompt: "Lors de la condensation de deux oses, il y a…",
        choices: ["élimination d’une molécule d’eau", "libération de dioxyde de carbone", "ajout d’une molécule d’eau", "formation d’un ion cuivre"],
        correct: 0,
        explanation: "Pour chaque liaison formée entre deux oses, une molécule d’eau est éliminée : C₆H₁₂O₆ + C₆H₁₂O₆ → C₁₂H₂₂O₁₁ + H₂O.",
        wrong: "Ajouter de l’eau, c’est l’inverse : l’hydrolyse, qui casse un oside. La condensation, elle, élimine une molécule d’eau par liaison.",
      },
      {
        prompt: "Glucose + fructose, par condensation, donnent…",
        choices: ["du saccharose", "du maltose", "du lactose", "de l’amidon"],
        correct: 0,
        explanation: "Le saccharose (C₁₂H₂₂O₁₁) est le diholoside formé d’un glucose et d’un fructose.",
        wrong: "Le maltose est formé de deux glucoses et l’amidon est un polyholoside. Le diholoside glucose + fructose est le saccharose.",
      },
      {
        prompt: "Que montre un test positif à la liqueur de Fehling ?",
        choices: ["Un précipité rouge brique à chaud", "La solution devient incolore", "Un précipité bleu à froid", "Un dégagement gazeux"],
        correct: 0,
        explanation: "La liqueur de Fehling (bleue) chauffée avec un sucre réducteur donne un précipité rouge brique (oxyde de cuivre Cu₂O).",
        wrong: "La liqueur de Fehling est bleue au départ ; si le sucre est réducteur, on observe à chaud un précipité rouge brique.",
      },
      {
        prompt: "Pourquoi le saccharose donne-t-il un test de Fehling négatif ?",
        choices: ["Parce qu’il n’est pas réducteur", "Parce qu’il n’est pas soluble dans l’eau", "Parce que c’est un ose", "Parce qu’il contient de l’azote"],
        correct: 0,
        explanation: "Tous les oses sont réducteurs, mais le saccharose est un diholoside non réducteur : le test reste négatif.",
        wrong: "Le saccharose n’est pas un ose, c’est un diholoside (glucose + fructose) non réducteur. C’est pour cela que la liqueur de Fehling reste bleue.",
      },
      {
        prompt: "L’amidon, la cellulose et le glycogène sont des…",
        choices: ["polyholosides", "oligoholosides", "oses", "hétérosides"],
        correct: 0,
        explanation: "Ce sont des holosides de plus de 10 oses, de formule (C₆H₁₀O₅)ₙ : des polyholosides.",
        wrong: "Ces molécules contiennent un très grand nombre d’oses (n > 10) : ce sont des polyholosides, pas des oligoholosides (2 à 10 oses).",
      },
      {
        prompt: "L’hydrolyse d’un hétéroside donne…",
        choices: [
          "des oses et une molécule non glucidique (aglycone)",
          "uniquement du glucose",
          "uniquement des acides aminés",
          "rien : il n’est pas hydrolysable",
        ],
        correct: 0,
        explanation: "Un hétéroside libère des oses et une molécule qui ne fait pas partie des glucides, l’aglycone (ex. la coniférine).",
        wrong: "Contrairement à un holoside (qui ne donne que des oses), un hétéroside libère aussi une partie non glucidique : l’aglycone.",
      },
      {
        prompt: "Après avoir chauffé longuement une solution de saccharose, la liqueur de Fehling donne un précipité rouge brique. Pourquoi ?",
        choices: [
          "L’hydrolyse a libéré du glucose et du fructose, qui sont réducteurs",
          "La chaleur seule fait réagir la liqueur de Fehling",
          "Le saccharose est devenu réducteur sans changer de structure",
          "Il s’est formé de l’amidon",
        ],
        correct: 0,
        explanation: "Le chauffage prolongé hydrolyse le saccharose en glucose + fructose. Ces oses sont réducteurs : le test devient positif.",
        wrong: "Le saccharose lui-même reste non réducteur. C’est son hydrolyse qui libère des oses réducteurs (glucose et fructose), d’où le précipité.",
      },
    ],
  },
  {
    title: "L’énergie thermique",
    description: "Température, chaleur, bilans thermiques et modes de transfert.",
    pdf: "Physique",
    mode: "classic",
    secondsPerQuestion: 60,
    difficulty: "hard",
    combo: false,
    lives: 3,
    questions: [
      {
        prompt: "La température caractérise…",
        choices: [
          "l’agitation thermique (énergie cinétique) des particules",
          "la masse d’un corps",
          "la quantité de chaleur contenue dans un corps",
          "la pression d’un gaz",
        ],
        correct: 0,
        explanation: "La température est une grandeur macroscopique qui traduit l’énergie cinétique des particules : plus elles s’agitent, plus la température est élevée.",
        wrong: "Attention : un corps ne « contient » pas de chaleur. La température mesure l’agitation des particules ; la chaleur est un transfert.",
      },
      {
        prompt: "Combien valent 25 °C en kelvins ?",
        choices: ["298 K", "248 K", "25 K", "273 K"],
        correct: 0,
        explanation: "T(K) = t(°C) + 273, donc 25 + 273 = 298 K.",
        wrong: "Il faut ajouter 273, pas le soustraire : T(K) = t(°C) + 273 = 298 K.",
      },
      {
        prompt: "À quoi correspond le zéro absolu ?",
        choices: ["0 K, soit −273 °C", "0 °C", "−100 °C", "273 K"],
        correct: 0,
        explanation: "Au zéro absolu (0 K = −273 °C), les constituants de la matière sont immobiles : il n’y a plus d’agitation thermique.",
        wrong: "0 °C (= 273 K) est la fusion de la glace. Le zéro absolu est la température la plus basse possible : 0 K, soit −273 °C.",
      },
      {
        prompt: "La chaleur Q est…",
        choices: [
          "un transfert d’énergie entre deux corps, exprimé en joules",
          "une énergie que possède un corps",
          "une autre façon de dire température",
          "une grandeur exprimée en watts",
        ],
        correct: 0,
        explanation: "La chaleur est un transfert d’agitation thermique entre deux corps ; elle s’exprime en joules (J).",
        wrong: "On ne peut pas dire qu’un corps possède de la chaleur : la chaleur est un échange d’énergie, en joules (le watt est une puissance).",
      },
      {
        prompt: "Selon la convention du banquier, un corps qui perd de la chaleur a…",
        choices: ["Q < 0", "Q > 0", "Q = 0", "Q = m × L dans tous les cas"],
        correct: 0,
        explanation: "Convention du banquier : énergie reçue → Q > 0 ; énergie perdue → Q < 0.",
        wrong: "Comme un compte en banque : ce que le corps reçoit est positif, ce qu’il perd est négatif. Perte de chaleur → Q < 0.",
      },
      {
        prompt: "Spontanément, la chaleur passe…",
        choices: ["du corps chaud vers le corps froid", "du corps froid vers le corps chaud", "du corps le plus lourd vers le plus léger", "autant dans les deux sens"],
        correct: 0,
        explanation: "Le transfert se fait spontanément du chaud vers le froid, jusqu’à l’équilibre thermique (même température).",
        wrong: "Le transfert spontané va toujours du chaud vers le froid ; il s’arrête quand les deux corps ont la même température.",
      },
      {
        prompt: "Quel mode de transfert se fait par contact, de proche en proche, sans déplacement de matière ?",
        choices: ["La conduction", "La convection", "Le rayonnement", "La sublimation"],
        correct: 0,
        explanation: "La conduction transmet la chaleur de proche en proche à travers un support matériel, sans mouvement de matière.",
        wrong: "La convection implique un mouvement de matière (fluides) et le rayonnement une onde électromagnétique. Sans déplacement de matière : conduction.",
      },
      {
        prompt: "Quel mode de transfert est possible dans le vide ?",
        choices: ["Le rayonnement", "La conduction", "La convection", "Aucun"],
        correct: 0,
        explanation: "Le rayonnement est une onde électromagnétique (infrarouge par exemple) : il n’a pas besoin de support matériel.",
        wrong: "Conduction et convection ont besoin de matière. Le rayonnement (comme celui du Soleil) traverse le vide.",
      },
      {
        prompt: "Quelle quantité de chaleur faut-il pour chauffer 150 g d’eau de 20 °C à 80 °C ? (c = 4 186 J·kg⁻¹·K⁻¹)",
        choices: ["≈ 37 674 J", "≈ 37 674 000 J", "≈ 12 558 J", "≈ 50 232 J"],
        correct: 0,
        explanation: "Q = m × c × (T_f − T_i) = 0,150 × 4 186 × (80 − 20) ≈ 37 674 J.",
        wrong: "Vérifiez les unités et l’écart de température : la masse doit être en kg (150 g = 0,150 kg) et ΔT = 80 − 20 = 60 °C.",
      },
      {
        prompt: "Quelle chaleur faut-il pour faire fondre 1,5 kg de glace à 0 °C ? (L_f = 335 000 J·kg⁻¹)",
        choices: ["502 500 J", "223 333 J", "335 000 J", "6 279 J"],
        correct: 0,
        explanation: "Changement d’état uniquement : Q = m × L = 1,5 × 335 000 = 502 500 J.",
        wrong: "Il n’y a pas de variation de température ici, seulement un changement d’état : on utilise Q = m × L (on multiplie, on ne divise pas).",
      },
      {
        prompt: "La fusion, la vaporisation et la sublimation correspondent à…",
        choices: ["Q > 0 : le système reçoit de l’énergie", "Q < 0 : le système perd de l’énergie", "Q = 0", "un signe qui dépend de la masse"],
        correct: 0,
        explanation: "Pour passer à un état plus désordonné (solide → liquide → gaz), le système doit recevoir de l’énergie : Q > 0.",
        wrong: "Solidification, liquéfaction et condensation libèrent de l’énergie (Q < 0). Fusion, vaporisation et sublimation en demandent : Q > 0.",
      },
      {
        prompt: "Quelle est la résistance thermique d’un parpaing de 20 cm d’épaisseur ? (λ = 1,15 W·m⁻¹·K⁻¹)",
        choices: ["≈ 0,17 m²·K·W⁻¹", "≈ 0,23 m²·K·W⁻¹", "≈ 5,75 m²·K·W⁻¹", "≈ 17,4 m²·K·W⁻¹"],
        correct: 0,
        explanation: "R = e / λ = 0,20 / 1,15 ≈ 0,17 m²·K·W⁻¹.",
        wrong: "R = e / λ avec e en mètres : 20 cm = 0,20 m. On divise l’épaisseur par λ (pas l’inverse, pas de multiplication).",
      },
      {
        prompt: "Un bon isolant thermique possède…",
        choices: ["une conductivité thermique λ faible", "une conductivité thermique λ élevée", "une résistance thermique R faible", "une capacité thermique nulle"],
        correct: 0,
        explanation: "Plus λ est faible, moins le matériau conduit la chaleur (laine de verre : 0,047 ; cuivre : 380). Sa résistance R = e/λ est alors grande.",
        wrong: "Le cuivre (λ = 380) conduit très bien la chaleur : c’est l’inverse d’un isolant. Un isolant a un λ faible, donc une résistance R élevée.",
      },
      {
        prompt: "La capacité thermique massique de l’eau liquide vaut 4 186 J·kg⁻¹·K⁻¹. Cela signifie qu’il faut…",
        choices: [
          "4 186 J pour élever de 1 K la température de 1 kg d’eau",
          "4 186 J pour faire fondre 1 kg de glace",
          "4 186 J pour vaporiser 1 g d’eau",
          "que 1 kg d’eau contient 4 186 J de chaleur",
        ],
        correct: 0,
        explanation: "c est l’énergie à fournir à 1 kg d’une substance pour élever sa température de 1 K (ou 1 °C).",
        wrong: "La fusion et la vaporisation font intervenir la chaleur latente L, pas c. La capacité thermique c concerne une variation de température de 1 K pour 1 kg.",
      },
    ],
  },
  {
    title: "De l’aliment aux nutriments",
    description: "L’appareil digestif, les enzymes et l’assimilation des nutriments.",
    pdf: "Bio aliment",
    mode: "timed",
    secondsPerQuestion: 30,
    difficulty: "medium",
    combo: true,
    lives: null,
    questions: [
      {
        prompt: "Lequel de ces organes n’appartient pas au tube digestif ?",
        choices: ["Le pancréas", "L’œsophage", "L’estomac", "L’intestin grêle"],
        correct: 0,
        explanation: "Le pancréas est une glande annexe : les aliments ne le traversent pas, il déverse son suc dans l’intestin grêle.",
        wrong: "Le tube digestif est le trajet des aliments (bouche, œsophage, estomac, intestin grêle, côlon, rectum, anus). Le pancréas est une glande digestive annexe.",
      },
      {
        prompt: "Où commence la digestion chimique de l’amidon ?",
        choices: ["Dans la bouche, grâce à l’amylase salivaire", "Dans l’estomac, grâce à la pepsine", "Dans le gros intestin", "Dans le foie"],
        correct: 0,
        explanation: "La salive contient l’amylase salivaire, qui commence à découper l’amidon en maltose dès la bouche.",
        wrong: "La pepsine de l’estomac agit sur les protéines, pas sur l’amidon. L’amidon est attaqué dès la bouche par l’amylase de la salive.",
      },
      {
        prompt: "Qu’est-ce que le péristaltisme ?",
        choices: [
          "Les contractions des muscles du tube digestif qui font avancer le bol alimentaire",
          "La mastication des aliments par les dents",
          "La sécrétion de bile par le foie",
          "L’absorption de l’eau dans le côlon",
        ],
        correct: 0,
        explanation: "Le péristaltisme est la contraction des muscles lisses des parois, qui fait progresser le bol alimentaire de proche en proche, de l’œsophage à l’anus.",
        wrong: "La mastication se fait dans la bouche ; le péristaltisme, ce sont les contractions musculaires qui font avancer les aliments dans le tube digestif.",
      },
      {
        prompt: "Le suc gastrique est riche en…",
        choices: ["acide chlorhydrique et pepsine", "amylase et sels biliaires", "bile", "lipase uniquement"],
        correct: 0,
        explanation: "Les glandes gastriques libèrent un suc riche en acide chlorhydrique et en pepsine, qui commence la simplification des protéines.",
        wrong: "Les sels biliaires viennent du foie (bile) et l’amylase de la salive ou du pancréas. Le suc de l’estomac contient acide chlorhydrique + pepsine.",
      },
      {
        prompt: "Dans l’estomac, la pepsine commence la simplification…",
        choices: ["des protéines", "des lipides", "des glucides", "des vitamines"],
        correct: 0,
        explanation: "La pepsine est une enzyme qui simplifie les protéines (protides). Leur digestion se termine dans l’intestin grêle.",
        wrong: "Les glucides commencent leur digestion dans la bouche et les lipides dans l’intestin grêle. Dans l’estomac, la pepsine attaque les protéines.",
      },
      {
        prompt: "Quel est le rôle de la bile ?",
        choices: [
          "Elle ne contient pas d’enzymes : ses sels biliaires facilitent l’action des lipases",
          "Elle contient l’amylase qui digère l’amidon",
          "Elle digère les protéines",
          "Elle est produite par le pancréas",
        ],
        correct: 0,
        explanation: "La bile, fabriquée par le foie et stockée dans la vésicule biliaire, fragmente les lipides grâce aux sels biliaires, ce qui facilite l’action des lipases.",
        wrong: "Piège classique : la bile ne contient aucune enzyme. Elle émulsionne les lipides, et elle vient du foie, pas du pancréas.",
      },
      {
        prompt: "Quel est le lieu principal de la digestion et de l’absorption des nutriments ?",
        choices: ["L’intestin grêle", "L’estomac", "Le gros intestin", "L’œsophage"],
        correct: 0,
        explanation: "Dans l’intestin grêle, suc pancréatique, bile et suc intestinal terminent la digestion ; les nutriments passent ensuite dans le sang et la lymphe.",
        wrong: "L’estomac ne fait que commencer la digestion des protéines. C’est l’intestin grêle qui termine la digestion et absorbe les nutriments.",
      },
      {
        prompt: "Quels nutriments sont issus de la digestion des lipides ?",
        choices: ["Les acides gras et le glycérol", "Les acides aminés", "Le glucose", "Le maltose"],
        correct: 0,
        explanation: "Lipides → acides gras + glycérol ; protides → acides aminés ; glucides → glucose (oses).",
        wrong: "Les acides aminés proviennent des protéines et le glucose des glucides. Les lipides donnent des acides gras et du glycérol, qui passent dans la lymphe.",
      },
      {
        prompt: "Qu’est-ce qu’une enzyme ?",
        choices: [
          "Une protéine qui reconnaît spécifiquement son substrat grâce à son site actif",
          "Un glucide qui fournit de l’énergie",
          "Une vitamine absorbée dans l’intestin",
          "Une molécule détruite après chaque réaction",
        ],
        correct: 0,
        explanation: "Une enzyme est une protéine en 3D dont le site actif reconnaît spécifiquement un substrat (système clé/serrure) et l’hydrolyse en produits.",
        wrong: "Une enzyme est une protéine, et elle n’est pas détruite par la réaction. Son site actif reconnaît un substrat précis, comme une serrure et sa clé.",
      },
      {
        prompt: "En fin de réaction, l’enzyme…",
        choices: ["reste intacte", "est transformée en produit", "est absorbée dans le sang", "devient le substrat"],
        correct: 0,
        explanation: "Après l’hydrolyse, l’enzyme est libérée intacte et peut agir à nouveau sur un autre substrat.",
        wrong: "C’est le substrat qui est transformé en produits. L’enzyme, elle, sort intacte de la réaction.",
      },
      {
        prompt: "À une température très élevée, une enzyme…",
        choices: [
          "est dénaturée : sa forme 3D change et elle n’agit plus",
          "agit de plus en plus vite sans limite",
          "se multiplie",
          "reconnaît de nouveaux substrats",
        ],
        correct: 0,
        explanation: "La forte chaleur casse les liaisons de l’enzyme et modifie sa forme 3D : le système clé/serrure ne fonctionne plus, l’enzyme est dénaturée.",
        wrong: "Une enzyme a une température optimale. Au-delà, sa forme 3D est détruite (dénaturation) et la réaction n’a plus lieu. Même chose pour un pH extrême.",
      },
      {
        prompt: "Qu’appelle-t-on le microbiote intestinal ?",
        choices: [
          "L’ensemble des micro-organismes qui vivent en symbiose dans l’intestin",
          "L’ensemble des enzymes du pancréas",
          "Les cellules qui tapissent la paroi de l’intestin",
          "Uniquement des virus pathogènes",
        ],
        correct: 0,
        explanation: "Le microbiote est l’ensemble des micro-organismes de l’intestin grêle et du côlon ; il favorise la digestion, notamment en dégradant les fibres.",
        wrong: "Le microbiote n’est pas fait d’enzymes ni de nos propres cellules : ce sont des micro-organismes (bactéries surtout) qui vivent en symbiose avec nous.",
      },
      {
        prompt: "Que deviennent les fibres alimentaires ?",
        choices: [
          "Non simplifiées dans l’intestin grêle, elles sont fermentées par les bactéries du gros intestin",
          "Elles sont absorbées dans l’estomac",
          "Elles sont transformées en acides aminés",
          "Elles passent dans la lymphe",
        ],
        correct: 0,
        explanation: "Les fibres ne sont pas simplifiées par nos enzymes ; dans le côlon, les fermentations bactériennes en dégradent une partie (ex. cellulose → glucose).",
        wrong: "Nos enzymes ne savent pas digérer les fibres : elles arrivent intactes dans le gros intestin, où ce sont les bactéries du microbiote qui les dégradent.",
      },
      {
        prompt: "Où a lieu une importante absorption d’eau qui solidifie les résidus de la digestion ?",
        choices: ["Dans le gros intestin (côlon)", "Dans la bouche", "Dans l’œsophage", "Dans l’estomac"],
        correct: 0,
        explanation: "Le gros intestin absorbe beaucoup d’eau : les résidus deviennent plus solides et forment la matière fécale.",
        wrong: "L’œsophage ne fait que transporter le bol alimentaire. C’est dans le côlon que l’eau est réabsorbée et que les selles se forment.",
      },
    ],
  },
];

async function findPdf(prefix: string, mustInclude?: string) {
  const dir = path.join(os.homedir(), "Downloads");
  const files = (await readdir(dir)).filter((f) => f.normalize("NFC").startsWith(prefix.normalize("NFC")) && f.toLowerCase().endsWith(".pdf"));
  const match = files.find((f) => !mustInclude || f.normalize("NFC").includes(mustInclude)) ?? null;
  return match ? { full: path.join(dir, match), name: match.normalize("NFC").trim() } : null;
}

async function main() {
  const teacher = await db.user.findFirst({ where: { role: "TEACHER" }, orderBy: { createdAt: "asc" } });
  const course = await db.course.upsert({
    where: { code: "SCI-1STAV" },
    update: {},
    create: {
      code: "SCI-1STAV",
      title: "Nutrition & énergie · 1re STAV",
      description: "Glucides, énergie thermique et digestion : de l’aliment aux nutriments.",
      teacherId: teacher?.id ?? null,
      classDays: "1,3,5",
    },
  });

  await mkdir(path.join(process.cwd(), "uploads"), { recursive: true });
  for (const q of QUIZZES) {
    if (await db.quiz.findFirst({ where: { courseId: course.id, title: q.title } })) {
      console.log(`· ${q.title} existe déjà`);
      continue;
    }
    const pdf = await findPdf(q.pdf, q.pdf === "Physique" ? "thermiques" : undefined);
    const quiz = await db.quiz.create({
      data: {
        courseId: course.id,
        title: q.title,
        description: q.description,
        mode: q.mode,
        secondsPerQuestion: q.secondsPerQuestion,
        difficulty: q.difficulty,
        combo: q.combo,
        lives: q.lives,
        shuffleQuestions: true,
        shuffleAnswers: true,
        published: true,
        sourceFileName: pdf?.name ?? null,
        questions: {
          create: q.questions.map((qq, i) => ({
            order: i,
            prompt: qq.prompt,
            explanation: qq.explanation,
            wrongFeedback: qq.wrong,
            choices: { create: qq.choices.map((text, j) => ({ order: j, text, isCorrect: j === qq.correct })) },
          })),
        },
      },
    });
    if (pdf) {
      await copyFile(pdf.full, path.join(process.cwd(), "uploads", `${quiz.id}.pdf`));
      await db.quiz.update({ where: { id: quiz.id }, data: { sourceFilePath: `${quiz.id}.pdf` } });
    }
    console.log(`✓ ${q.title}: ${q.questions.length} questions${pdf ? ` (PDF : ${pdf.name})` : " (PDF introuvable)"}`);
  }
  console.log(`Cours ${course.code} : ${course.title}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
