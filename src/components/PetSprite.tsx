import { PET_COLORS, type Mood, type PetColor, type StageKey } from "@/lib/pet/rules";

const INK = "#1b1830";
const SCALE: Record<StageKey, number> = { egg: 1, baby: 0.62, child: 0.76, teen: 0.88, adult: 1 };

function Eyes({ mood }: { mood: Mood }) {
  switch (mood) {
    case "happy":
      return (
        <g stroke={INK} strokeWidth="5" fill="none" strokeLinecap="round">
          <path d="M72 96 Q80 86 88 96" />
          <path d="M112 96 Q120 86 128 96" />
        </g>
      );
    case "hungry":
      return (
        <g>
          <circle cx="80" cy="95" r="10" fill="#fff" />
          <circle cx="120" cy="95" r="10" fill="#fff" />
          <circle cx="82" cy="97" r="6" fill={INK} />
          <circle cx="122" cy="97" r="6" fill={INK} />
          <circle cx="84" cy="94" r="2" fill="#fff" />
          <circle cx="124" cy="94" r="2" fill="#fff" />
        </g>
      );
    case "weak":
      return (
        <g stroke={INK} strokeWidth="4.5" fill="none" strokeLinecap="round">
          <path d="M72 98 Q80 102 88 98" />
          <path d="M112 98 Q120 102 128 98" />
        </g>
      );
    default:
      return (
        <g fill={INK}>
          <circle cx="80" cy="95" r="6.5" />
          <circle cx="120" cy="95" r="6.5" />
          <circle cx="82" cy="93" r="2" fill="#fff" />
          <circle cx="122" cy="93" r="2" fill="#fff" />
        </g>
      );
  }
}

function Mouth({ mood }: { mood: Mood }) {
  switch (mood) {
    case "happy":
      return <path d="M86 112 Q100 128 114 112 Z" fill="#3b1a2a" />;
    case "hungry":
      return <ellipse cx="100" cy="119" rx="7" ry="8" fill="#3b1a2a" />;
    case "weak":
      return <path d="M88 120 Q94 115 100 120 Q106 125 112 120" stroke={INK} strokeWidth="3.5" fill="none" strokeLinecap="round" />;
    default:
      return <path d="M90 114 Q100 122 110 114" stroke={INK} strokeWidth="4" fill="none" strokeLinecap="round" />;
  }
}

export default function PetSprite({
  stage,
  mood,
  color,
  size = 200,
  label,
}: {
  stage: StageKey;
  mood: Mood;
  color: PetColor;
  size?: number;
  label?: string;
}) {
  const [light, base] = PET_COLORS[color];
  const gid = `pet-${color}-${mood}`;
  const s = SCALE[stage];

  if (stage === "egg") {
    return (
      <svg viewBox="0 0 200 200" width={size} height={size} role="img" aria-label={label} className="pet-sprite pet-egg">
        <defs>
          <radialGradient id={gid} cx=".35" cy=".3" r=".8">
            <stop offset="0" stopColor="#fffaf0" />
            <stop offset="1" stopColor={light} />
          </radialGradient>
        </defs>
        <ellipse cx="100" cy="182" rx="46" ry="8" fill="rgba(0,0,0,.25)" />
        <path d="M100 28 C142 28 160 100 156 132 C152 166 128 180 100 180 C72 180 48 166 44 132 C40 100 58 28 100 28 Z" fill={`url(#${gid})`} />
        <circle cx="78" cy="88" r="9" fill={base} opacity=".55" />
        <circle cx="122" cy="120" r="12" fill={base} opacity=".5" />
        <circle cx="90" cy="145" r="7" fill={base} opacity=".45" />
        <path d="M62 108 L76 98 L86 110 L98 96 L110 108 L122 98 L138 108" stroke="#5a4a3a" strokeWidth="3" fill="none" strokeLinejoin="round" opacity=".55" />
      </svg>
    );
  }

  const weak = mood === "weak";
  return (
    <svg viewBox="0 0 200 200" width={size} height={size} role="img" aria-label={label} className={`pet-sprite pet-${mood}`}>
      <defs>
        <radialGradient id={gid} cx=".35" cy=".3" r=".85">
          <stop offset="0" stopColor={light} />
          <stop offset="1" stopColor={base} />
        </radialGradient>
      </defs>
      <ellipse cx="100" cy="184" rx={58 * s} ry="8" fill="rgba(0,0,0,.25)" />
      <g transform={`translate(100 180) scale(${s}) translate(-100 -180)`} opacity={weak ? 0.75 : 1}>
        {(stage === "teen" || stage === "adult") && (
          <g fill={base}>
            <path d="M58 64 Q46 30 70 40 Q78 52 76 66 Z" />
            <path d="M142 64 Q154 30 130 40 Q122 52 124 66 Z" />
          </g>
        )}
        {stage === "adult" && <path d="M150 150 Q186 150 176 120 Q172 140 152 136 Z" fill={base} />}
        <path d="M100 40 C152 40 172 96 170 132 C168 166 140 180 100 180 C60 180 32 166 30 132 C28 96 48 40 100 40 Z" fill={`url(#${gid})`} />
        <ellipse cx="80" cy="64" rx="18" ry="10" fill="#fff" opacity=".35" transform="rotate(-20 80 64)" />
        {stage !== "baby" && <ellipse cx="100" cy="150" rx="34" ry="20" fill="#fff" opacity=".22" />}
        {stage === "adult" && (
          <path d="M84 40 L90 22 L100 34 L110 22 L116 40 Z" fill="#ffd166" stroke="#c98b12" strokeWidth="1.5" />
        )}
        <Eyes mood={mood} />
        <circle cx="66" cy="112" r="8" fill="#ff6f8a" opacity={mood === "happy" ? 0.45 : 0.25} />
        <circle cx="134" cy="112" r="8" fill="#ff6f8a" opacity={mood === "happy" ? 0.45 : 0.25} />
        <Mouth mood={mood} />
        {mood === "hungry" && <path d="M108 124 Q110 134 106 138" stroke="#9fdcff" strokeWidth="3" fill="none" strokeLinecap="round" />}
      </g>
      {mood === "hungry" && (
        <g className="pet-bubble">
          <circle cx="160" cy="44" r="20" fill="rgba(255,255,255,.9)" />
          <circle cx="140" cy="68" r="5" fill="rgba(255,255,255,.9)" />
          <text x="160" y="51" textAnchor="middle" fontSize="20">🍎</text>
        </g>
      )}
      {weak && <text x="150" y="58" fontSize="22" fill="#cfd6ee" className="pet-z">z</text>}
      {mood === "happy" && <text x="152" y="52" fontSize="20" fill="#ff8fb8" className="pet-heart">♥</text>}
    </svg>
  );
}
