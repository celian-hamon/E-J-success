// Adds LaTeX formulas and a state-change diagram to the "L’énergie thermique" quiz.
// Run: npx tsx --env-file=.env scripts/enrich-thermique.mts   (safe to run twice)
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

const LATEX: Record<string, { prompt?: string; explanation?: string; wrong?: string }> = {
  "Combien valent 25 °C en kelvins ?": { explanation: "$T(\\mathrm{K}) = t(°\\mathrm{C}) + 273$, donc $25 + 273 = 298\\ \\mathrm{K}$." },
  "Quelle quantité de chaleur faut-il pour chauffer 150 g d’eau de 20 °C à 80 °C ? (c = 4 186 J·kg⁻¹·K⁻¹)": {
    prompt: "Quelle quantité de chaleur faut-il pour chauffer 150 g d’eau de 20 °C à 80 °C ? ($c = 4\\,186\\ \\mathrm{J \\cdot kg^{-1} \\cdot K^{-1}}$)",
    explanation: "$$Q = m \\cdot c \\cdot (T_f - T_i) = 0{,}150 \\times 4\\,186 \\times (80 - 20) \\approx 37\\,674\\ \\mathrm{J}$$",
  },
  "Quelle chaleur faut-il pour faire fondre 1,5 kg de glace à 0 °C ? (L_f = 335 000 J·kg⁻¹)": {
    prompt: "Quelle chaleur faut-il pour faire fondre 1,5 kg de glace à 0 °C ? ($L_f = 335\\,000\\ \\mathrm{J \\cdot kg^{-1}}$)",
    explanation: "Changement d’état uniquement : $$Q = m \\cdot L_f = 1{,}5 \\times 335\\,000 = 502\\,500\\ \\mathrm{J}$$",
  },
  "Quelle est la résistance thermique d’un parpaing de 20 cm d’épaisseur ? (λ = 1,15 W·m⁻¹·K⁻¹)": {
    prompt: "Quelle est la résistance thermique d’un parpaing de 20 cm d’épaisseur ? ($\\lambda = 1{,}15\\ \\mathrm{W \\cdot m^{-1} \\cdot K^{-1}}$)",
    explanation: "$$R = \\frac{e}{\\lambda} = \\frac{0{,}20}{1{,}15} \\approx 0{,}17\\ \\mathrm{m^2 \\cdot K \\cdot W^{-1}}$$",
  },
};

// Diagram of the six changes of state, drawn as SVG then rendered to WebP.
const DIAGRAM = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="760" viewBox="0 0 1200 760" font-family="Helvetica, Arial, sans-serif">
  <rect width="1200" height="760" fill="#ffffff"/>
  <defs>
    <marker id="a" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0,0 L10,5 L0,10 z" fill="#c2410c"/></marker>
    <marker id="b" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0,0 L10,5 L0,10 z" fill="#1d4ed8"/></marker>
  </defs>
  <g font-size="34" font-weight="700" text-anchor="middle" fill="#111827">
    <rect x="470" y="40" width="260" height="110" rx="20" fill="#e0f2fe" stroke="#0284c7" stroke-width="4"/><text x="600" y="108">GAZ</text>
    <rect x="90" y="560" width="300" height="110" rx="20" fill="#dbeafe" stroke="#1d4ed8" stroke-width="4"/><text x="240" y="628">LIQUIDE</text>
    <rect x="810" y="560" width="300" height="110" rx="20" fill="#f1f5f9" stroke="#475569" stroke-width="4"/><text x="960" y="628">SOLIDE</text>
  </g>
  <g stroke-width="6" fill="none">
    <path d="M330 545 L520 165" stroke="#c2410c" marker-end="url(#a)"/>
    <path d="M480 175 L290 555" stroke="#1d4ed8" marker-end="url(#b)"/>
    <path d="M870 545 L680 165" stroke="#c2410c" marker-end="url(#a)"/>
    <path d="M720 175 L910 555" stroke="#1d4ed8" marker-end="url(#b)"/>
    <path d="M800 590 L405 590" stroke="#c2410c" marker-end="url(#a)"/>
    <path d="M400 645 L795 645" stroke="#1d4ed8" marker-end="url(#b)"/>
  </g>
  <g font-size="28" font-weight="600">
    <text x="300" y="330" fill="#c2410c" transform="rotate(-63 300 330)">Vaporisation</text>
    <text x="420" y="430" fill="#1d4ed8" transform="rotate(-63 420 430)">Liquéfaction</text>
    <text x="830" y="270" fill="#c2410c" transform="rotate(63 830 270)">Sublimation</text>
    <text x="720" y="380" fill="#1d4ed8" transform="rotate(63 720 380)">Condensation</text>
    <text x="600" y="575" fill="#c2410c" text-anchor="middle">Fusion</text>
    <text x="600" y="690" fill="#1d4ed8" text-anchor="middle">Solidification</text>
  </g>
  <g font-size="26" font-weight="600">
    <text x="40" y="60" fill="#c2410c">→ Q &gt; 0 : le corps reçoit de l’énergie</text>
    <text x="40" y="100" fill="#1d4ed8">→ Q &lt; 0 : le corps cède de l’énergie</text>
  </g>
</svg>`;

async function main() {
  const quiz = await db.quiz.findFirst({ where: { title: "L’énergie thermique", course: { code: "SCI-1STAV" } }, include: { questions: true } });
  if (!quiz) throw new Error("Quiz « L’énergie thermique » introuvable : lancez d’abord import-stav-course.mts");

  for (const q of quiz.questions) {
    const patch = LATEX[q.prompt];
    if (!patch) continue;
    await db.question.update({
      where: { id: q.id },
      data: { prompt: patch.prompt ?? q.prompt, explanation: patch.explanation ?? q.explanation },
    });
    console.log(`✓ LaTeX : ${q.prompt.slice(0, 50)}…`);
  }

  const target = quiz.questions.find((q) => q.prompt.startsWith("La fusion, la vaporisation et la sublimation"));
  if (target && !target.imageId) {
    const { data, info } = await sharp(Buffer.from(DIAGRAM)).webp({ quality: 85 }).toBuffer({ resolveWithObject: true });
    const media = await db.media.create({ data: { mimeType: "image/webp", size: data.length, width: info.width, height: info.height } });
    const dir = path.join(process.cwd(), "uploads", "media");
    await mkdir(dir, { recursive: true });
    await writeFile(path.join(dir, `${media.id}.webp`), data);
    await db.question.update({ where: { id: target.id }, data: { imageId: media.id } });
    console.log(`✓ Schéma des changements d’état ajouté (${Math.round(data.length / 1024)} Ko)`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
