import { findOption, parseAvatar, type AvatarConfig } from "@/lib/gamification/avatar";
import { tierFor } from "@/lib/gamification/levels";

const INK = "#1b1830";

function color(part: "bg" | "skin" | "hairColor", id: string, which: "color" | "color2" = "color") {
  return findOption(part, id)?.[which] ?? "#888";
}

function star(cx: number, cy: number, r: number) {
  const pts = Array.from({ length: 10 }, (_, i) => {
    const a = (Math.PI / 5) * i - Math.PI / 2;
    const rr = i % 2 === 0 ? r : r * 0.45;
    return `${(cx + rr * Math.cos(a)).toFixed(1)},${(cy + rr * Math.sin(a)).toFixed(1)}`;
  });
  return pts.join(" ");
}

const HAIR_TOP = "M32 60 Q30 30 60 29 Q90 30 88 60 Q84 46 72 44 Q62 50 46 46 Q36 48 32 60 Z";

function HairBack({ hair, fill }: { hair: string; fill: string }) {
  if (hair === "long") return <path d="M29 64 Q28 28 60 28 Q92 28 91 64 L94 104 Q78 98 60 98 Q42 98 26 104 Z" fill={fill} />;
  if (hair === "afro") return <circle cx="60" cy="56" r="40" fill={fill} />;
  if (hair === "bun") return <circle cx="60" cy="24" r="11" fill={fill} />;
  return null;
}

function HairFront({ hair, fill }: { hair: string; fill: string }) {
  switch (hair) {
    case "short":
    case "long":
    case "bun":
      return <path d={HAIR_TOP} fill={fill} />;
    case "buzz":
      return <path d="M34 58 Q35 33 60 32 Q85 33 86 58 Q80 44 60 43 Q40 44 34 58 Z" fill={fill} opacity=".85" />;
    case "curly":
      return (
        <g fill={fill}>
          {[[36, 52], [40, 41], [49, 34], [60, 31], [71, 34], [80, 41], [84, 52]].map(([x, y]) => (
            <circle key={`${x}-${y}`} cx={x} cy={y} r="9" />
          ))}
        </g>
      );
    case "afro":
      return <path d="M34 56 Q38 38 60 38 Q82 38 86 56 Q74 47 60 47 Q46 47 34 56 Z" fill={fill} />;
    case "mohawk":
      return <path d="M53 46 Q52 22 60 12 Q68 22 67 46 Q60 42 53 46 Z" fill={fill} />;
    case "spiky":
      return <path d="M32 58 L35 36 L44 43 L47 24 L56 37 L61 19 L67 37 L76 26 L78 43 L86 35 L88 58 Q80 45 60 45 Q40 45 32 58 Z" fill={fill} />;
    default:
      return null;
  }
}

function Eyes({ eyes }: { eyes: string }) {
  const open = (cx: number) => (
    <g key={cx}>
      <circle cx={cx} cy="64" r="3.4" fill={INK} />
      <circle cx={cx + 1.1} cy="62.8" r="1.1" fill="#fff" />
    </g>
  );
  const arc = (cx: number, up = true) => (
    <path key={cx} d={up ? `M${cx - 4} 65 Q${cx} 60 ${cx + 4} 65` : `M${cx - 4} 64 Q${cx} 67 ${cx + 4} 64`} stroke={INK} strokeWidth="2.2" fill="none" strokeLinecap="round" />
  );
  switch (eyes) {
    case "happy":
      return <>{arc(50)}{arc(70)}</>;
    case "sleepy":
      return <>{arc(50, false)}{arc(70, false)}</>;
    case "wink":
      return <>{open(50)}{arc(70)}</>;
    case "stars":
      return (
        <g fill="#ffd166" stroke="#c98b12" strokeWidth=".6">
          <polygon points={star(50, 64, 5)} />
          <polygon points={star(70, 64, 5)} />
        </g>
      );
    default:
      return <>{open(50)}{open(70)}</>;
  }
}

function Mouth({ mouth }: { mouth: string }) {
  switch (mouth) {
    case "grin":
      return <path d="M50 75 Q60 87 70 75 Z" fill="#3b1a2a" />;
    case "neutral":
      return <path d="M54 78 L66 78" stroke={INK} strokeWidth="2.2" strokeLinecap="round" />;
    case "open":
      return <ellipse cx="60" cy="78" rx="4" ry="5" fill="#3b1a2a" />;
    case "tongue":
      return (
        <g>
          <path d="M50 75 Q60 87 70 75 Z" fill="#3b1a2a" />
          <ellipse cx="62" cy="81" rx="4" ry="3" fill="#ff7d9c" />
        </g>
      );
    default:
      return <path d="M52 76 Q60 83 68 76" stroke={INK} strokeWidth="2.2" fill="none" strokeLinecap="round" />;
  }
}

function Accessory({ accessory }: { accessory: string }) {
  switch (accessory) {
    case "glasses":
      return (
        <g stroke={INK} strokeWidth="2" fill="rgba(255,255,255,.18)">
          <circle cx="50" cy="64" r="7.5" />
          <circle cx="70" cy="64" r="7.5" />
          <path d="M57.5 63 Q60 61 62.5 63" fill="none" />
        </g>
      );
    case "headphones":
      return (
        <g>
          <path d="M30 64 Q28 24 60 24 Q92 24 90 64" stroke="#2a2f5a" strokeWidth="5" fill="none" />
          <rect x="24" y="56" width="11" height="18" rx="5" fill="#7b5cff" />
          <rect x="85" y="56" width="11" height="18" rx="5" fill="#7b5cff" />
        </g>
      );
    case "cap":
      return (
        <g>
          <path d="M31 50 Q32 25 60 25 Q88 25 89 50 Z" fill="#ff6fa8" />
          <path d="M60 46 L102 49 Q98 56 60 53 Z" fill="#d94d86" />
          <circle cx="60" cy="25" r="3" fill="#d94d86" />
        </g>
      );
    case "crown":
      return (
        <g>
          <path d="M38 38 L41 17 L51 29 L60 12 L69 29 L79 17 L82 38 Z" fill="#ffd166" stroke="#c98b12" strokeWidth="1.2" />
          <circle cx="60" cy="30" r="3" fill="#ff6fa8" />
          <circle cx="47" cy="33" r="2" fill="#2de2c4" />
          <circle cx="73" cy="33" r="2" fill="#2de2c4" />
        </g>
      );
    case "wizard":
      return (
        <g>
          <path d="M34 42 L62 2 L86 42 Z" fill="#5b3fd6" />
          <ellipse cx="60" cy="42" rx="32" ry="6" fill="#4630a8" />
          <polygon points={star(58, 26, 4)} fill="#ffd166" />
          <polygon points={star(68, 34, 2.5)} fill="#ffd166" />
        </g>
      );
    case "graduate":
      return (
        <g>
          <path d="M38 38 Q60 30 82 38 L82 30 L38 30 Z" fill="#14122a" />
          <path d="M22 28 L60 15 L98 28 L60 41 Z" fill="#1d1a36" />
          <path d="M60 28 L90 31 L90 46" stroke="#ffd166" strokeWidth="1.6" fill="none" />
          <circle cx="90" cy="47" r="2.4" fill="#ffd166" />
        </g>
      );
    case "halo":
      return <ellipse cx="60" cy="17" rx="22" ry="6" fill="none" stroke="#ffe29a" strokeWidth="3.5" opacity=".95" />;
    case "flame":
      return (
        <g>
          <path d="M94 34 Q86 22 94 8 Q96 18 102 20 Q108 28 102 36 Q98 40 94 34 Z" fill="#ff7a59" />
          <path d="M97 33 Q93 26 97 18 Q99 25 102 27 Q104 32 100 35 Z" fill="#ffd166" />
        </g>
      );
    default:
      return null;
  }
}

export function AvatarSvg({ config, size = 40, ring }: { config: AvatarConfig; size?: number; ring?: string }) {
  const hair = color("hairColor", config.hairColor);
  const skin = color("skin", config.skin);
  const bgId = `av-bg-${config.bg}`;
  return (
    <svg viewBox="0 0 120 120" width={size} height={size} role="img" aria-hidden="true" style={{ display: "block", flex: "none" }}>
      <defs>
        <linearGradient id={bgId} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor={color("bg", config.bg)} />
          <stop offset="1" stopColor={color("bg", config.bg, "color2")} />
        </linearGradient>
        <clipPath id="av-clip">
          <circle cx="60" cy="60" r="56" />
        </clipPath>
      </defs>
      <circle cx="60" cy="60" r="56" fill={`url(#${bgId})`} />
      <g clipPath="url(#av-clip)">
        <HairBack hair={config.hair} fill={hair} />
        <path d="M18 122 Q22 92 60 90 Q98 92 102 122 Z" fill="#232848" />
        <rect x="52" y="80" width="16" height="14" rx="4" fill={skin} />
        <circle cx="33" cy="65" r="5" fill={skin} />
        <circle cx="87" cy="65" r="5" fill={skin} />
        <ellipse cx="60" cy="62" rx="27" ry="29" fill={skin} />
        <HairFront hair={config.hair} fill={hair} />
        <circle cx="43" cy="72" r="4.5" fill="#ff6f8a" opacity=".22" />
        <circle cx="77" cy="72" r="4.5" fill="#ff6f8a" opacity=".22" />
        <Eyes eyes={config.eyes} />
        <Mouth mouth={config.mouth} />
      </g>
      <Accessory accessory={config.accessory} />
      {ring && <circle cx="60" cy="60" r="57.5" fill="none" stroke={ring} strokeWidth="4" />}
    </svg>
  );
}

/** A user's profile picture. Pass `level` to show their level-tier ring and badge. */
export default function Avatar({ avatar, size = 40, level }: { avatar: string | null; size?: number; level?: number }) {
  const config = parseAvatar(avatar);
  if (level === undefined) return <AvatarSvg config={config} size={size} />;
  const tier = tierFor(level);
  return (
    <span className="avatar" style={{ width: size, height: size }}>
      <AvatarSvg config={config} size={size} ring={tier.color} />
      {size >= 32 && (
        <span className="avatar-level" style={{ background: tier.color, fontSize: Math.max(9, size * 0.2) }}>
          {level}
        </span>
      )}
    </span>
  );
}
