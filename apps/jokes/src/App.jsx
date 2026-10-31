import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CATEGORIES, JOKES, LANGUAGES } from "./jokes.js";
import { pickJoke, randInt, wheelRotation } from "./randomizer.js";

const reducedMotion =
  typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
const SPIN_MS = reducedMotion ? 600 : 4200;
const REEL_ITEM_H = 56;
// The claude.ai artifact build sets HASYA_NO_SHARE: its sandbox refuses the Web Share API.
const canShare = typeof navigator !== "undefined" && !!navigator.share && !globalThis.HASYA_NO_SHARE;

const UI = {
  en: { title: "Hasya Wheel", tag: "Spin for a laugh", spin: "Spin!", spinning: "Spinning…", again: "Spin again", copy: "Copy", copied: "Copied!", share: "Share", mix: "Mix", hint: "Pick a language, then spin the wheel.", laughs: "laughs" },
  hi: { title: "हास्य चक्र", tag: "घुमाओ और हँसो", spin: "घुमाओ!", spinning: "घूम रहा है…", again: "फिर से घुमाओ", copy: "कॉपी", copied: "कॉपी हो गया!", share: "शेयर", mix: "मिक्स", hint: "भाषा चुनिए, फिर चक्र घुमाइए।", laughs: "ठहाके" },
  te: { title: "హాస్య చక్రం", tag: "తిప్పండి, నవ్వండి", spin: "తిప్పు!", spinning: "తిరుగుతోంది…", again: "మళ్ళీ తిప్పు", copy: "కాపీ", copied: "కాపీ అయింది!", share: "షేర్", mix: "మిక్స్", hint: "భాష ఎంచుకుని, చక్రం తిప్పండి.", laughs: "నవ్వులు" },
};

const storage = {
  get(key, fallback) {
    try {
      const v = localStorage.getItem(key);
      return v == null ? fallback : JSON.parse(v);
    } catch {
      return fallback;
    }
  },
  set(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      /* private mode etc. — non-essential */
    }
  },
};

export default function App() {
  const [langMode, setLangMode] = useState(() => storage.get("hw-lang", "mix")); // en | hi | te | mix
  const [rotation, setRotation] = useState(0);
  const [spinning, setSpinning] = useState(false);
  const [joke, setJoke] = useState(null);
  const [laughs, setLaughs] = useState(() => storage.get("hw-laughs", 0));
  const [burst, setBurst] = useState(0);
  const [copied, setCopied] = useState(false);
  const [reel, setReel] = useState({ offset: 0, animate: false });
  const seen = useRef(new Set());
  const timers = useRef([]);

  useEffect(() => storage.set("hw-lang", langMode), [langMode]);
  useEffect(() => storage.set("hw-laughs", laughs), [laughs]);
  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  // Chrome language: the joke's language once one is shown, else the picked language (English for Mix).
  const uiLang = joke?.lang ?? (langMode === "mix" ? "en" : langMode);
  const t = UI[uiLang];
  // In Mix mode keep wheel labels neutral while spinning so they don't spoil the reel's result.
  const wheelLang = langMode === "mix" ? (joke?.lang ?? "en") : langMode;

  const later = (fn, ms) => timers.current.push(setTimeout(fn, ms));

  const spin = useCallback(() => {
    if (spinning) return;
    setSpinning(true);
    setJoke(null);
    setCopied(false);

    const catIndex = randInt(CATEGORIES.length);
    const langIndex = langMode === "mix" ? randInt(LANGUAGES.length) : LANGUAGES.findIndex((l) => l.id === langMode);
    const lang = LANGUAGES[langIndex].id;
    const cat = CATEGORIES[catIndex].id;

    setRotation((r) => wheelRotation(r, catIndex, CATEGORIES.length, { jitter: Math.random() - 0.5 }));

    if (langMode === "mix") {
      // Roll the reel forward several full cycles and stop on the chosen language.
      setReel((r) => {
        const base = r.offset - (r.offset % LANGUAGES.length);
        return { offset: base + LANGUAGES.length * 6 + langIndex, animate: true };
      });
    }

    later(() => {
      const { joke: next, resetSeen } = pickJoke(JOKES, lang, cat, seen.current);
      if (resetSeen) for (const id of [...seen.current]) if (id.startsWith(`${lang}:`)) seen.current.delete(id);
      seen.current.add(next.id);
      setJoke(next);
      setSpinning(false);
      setBurst((b) => b + 1);
      // Snap the reel back to its first cycle without animating so it never grows unbounded.
      setReel((r) => ({ offset: r.offset % LANGUAGES.length, animate: false }));
    }, SPIN_MS + 80);
  }, [spinning, langMode]);

  // Space / Enter spins when focus isn't on another control.
  useEffect(() => {
    const onKey = (e) => {
      if ((e.key === " " || e.key === "Enter") && e.target === document.body) {
        e.preventDefault();
        spin();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [spin]);

  const jokeText = joke ? joke.lines.join("\n") : "";
  const category = joke ? CATEGORIES.find((c) => c.id === joke.cat) : null;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(jokeText);
      setCopied(true);
      later(() => setCopied(false), 1500);
    } catch {
      // Clipboard refused (some embedded views): select the joke so the user can copy it by hand.
      const lines = document.querySelectorAll(".card .line");
      if (lines.length) {
        const range = document.createRange();
        range.setStartBefore(lines[0]);
        range.setEndAfter(lines[lines.length - 1]);
        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(range);
      }
    }
  };
  const share = async () => {
    try {
      await navigator.share({ title: t.title, text: jokeText });
    } catch {
      /* cancelled or unsupported */
    }
  };

  return (
    <div className={`app font-${LANGUAGES.find((l) => l.id === uiLang).font}`}>
      <header className="top">
        <h1>
          <span className="logo" aria-hidden>
            😂
          </span>
          {t.title}
        </h1>
        <p className="tag">{t.tag}</p>
        <div className="laughs" title={t.laughs}>
          🤣 <strong>{laughs}</strong> {t.laughs}
        </div>
      </header>

      <nav className="langs" aria-label="Language">
        {LANGUAGES.map((l) => (
          <button
            key={l.id}
            className={`chip font-${l.font} ${langMode === l.id ? "on" : ""}`}
            onClick={() => setLangMode(l.id)}
            disabled={spinning}
            aria-pressed={langMode === l.id}
          >
            {l.label}
          </button>
        ))}
        <button
          className={`chip ${langMode === "mix" ? "on" : ""}`}
          onClick={() => setLangMode("mix")}
          disabled={spinning}
          aria-pressed={langMode === "mix"}
        >
          🎲 {UI[uiLang].mix}
        </button>
      </nav>

      <main className="stage">
        <div className="machine">
          {langMode === "mix" && <LanguageReel reel={reel} />}
          <Wheel rotation={rotation} lang={wheelLang} spinning={spinning} />
        </div>

        <button className="spin" onClick={spin} disabled={spinning}>
          {spinning ? t.spinning : joke ? t.again : t.spin}
        </button>

        <section className="card-slot" aria-live="polite">
          {joke ? (
            <article
              key={joke.id + burst}
              className={`card font-${LANGUAGES.find((l) => l.id === joke.lang).font}`}
              style={{ "--accent": category.color }}
            >
              <div className="card-head">
                <span className="badge">
                  {category.emoji} {category.label[joke.lang]}
                </span>
                <span className="badge ghost">{LANGUAGES.find((l) => l.id === joke.lang).label}</span>
              </div>
              {joke.lines.map((line, i) => (
                <p key={i} className={`line ${i === joke.lines.length - 1 ? "punch" : ""}`} style={{ "--i": i }}>
                  {line}
                </p>
              ))}
              <div className="actions" style={{ "--i": joke.lines.length }}>
                {["😂", "🤣", "😆"].map((e) => (
                  <button
                    key={e}
                    className="react"
                    onClick={() => {
                      setLaughs((n) => n + 1);
                      setBurst((b) => b + 1);
                    }}
                    aria-label={`React ${e}`}
                  >
                    {e}
                  </button>
                ))}
                <span className="spacer" />
                <button className="ghost-btn" onClick={copy}>
                  {copied ? t.copied : t.copy}
                </button>
                {canShare && (
                  <button className="ghost-btn" onClick={share}>
                    {t.share}
                  </button>
                )}
              </div>
            </article>
          ) : (
            !spinning && <p className="hint">{t.hint}</p>
          )}
        </section>
      </main>

      {burst > 0 && !spinning && <Confetti key={burst} />}
    </div>
  );
}

function Wheel({ rotation, lang, spinning }) {
  const n = CATEGORIES.length;
  const seg = 360 / n;
  const r = 140;
  const c = 150;
  const font = LANGUAGES.find((l) => l.id === lang).font;

  const slices = useMemo(
    () =>
      CATEGORIES.map((cat, i) => {
        const a0 = ((i * seg - 90) * Math.PI) / 180;
        const a1 = (((i + 1) * seg - 90) * Math.PI) / 180;
        const d = `M${c},${c} L${c + r * Math.cos(a0)},${c + r * Math.sin(a0)} A${r},${r} 0 0 1 ${c + r * Math.cos(a1)},${c + r * Math.sin(a1)} Z`;
        return { cat, d, mid: i * seg + seg / 2 };
      }),
    [seg]
  );

  return (
    <div className={`wheel-wrap ${spinning ? "is-spinning" : ""}`}>
      <div className="pointer" aria-hidden />
      <svg
        className="wheel"
        viewBox="0 0 300 300"
        role="img"
        aria-label="Joke category wheel"
        style={{ transform: `rotate(${rotation}deg)`, transitionDuration: `${SPIN_MS}ms` }}
      >
        <circle cx={c} cy={c} r={r + 8} className="rim" />
        {slices.map(({ cat, d, mid }) => (
          <g key={cat.id}>
            <path d={d} fill={cat.color} className="slice" />
            <g transform={`rotate(${mid} ${c} ${c})`}>
              <text x={c} y={c - r + 38} textAnchor="middle" className="slice-emoji">
                {cat.emoji}
              </text>
              <text x={c} y={c - r + 62} textAnchor="middle" className={`slice-label font-${font}`}>
                {cat.label[lang]}
              </text>
            </g>
          </g>
        ))}
        {Array.from({ length: n * 2 }, (_, i) => {
          const a = ((i * (seg / 2) - 90) * Math.PI) / 180;
          return <circle key={i} cx={c + (r + 4) * Math.cos(a)} cy={c + (r + 4) * Math.sin(a)} r={3} className="bulb" style={{ "--d": `${i * 80}ms` }} />;
        })}
        <circle cx={c} cy={c} r={26} className="hub" />
        <text x={c} y={c + 9} textAnchor="middle" className="hub-emoji">
          😂
        </text>
      </svg>
    </div>
  );
}

function LanguageReel({ reel }) {
  // Enough items to cover the furthest spin target (offset < 3 + 6 cycles + 3).
  const items = Array.from({ length: LANGUAGES.length * 9 }, (_, i) => LANGUAGES[i % LANGUAGES.length]);
  return (
    <div className="reel" aria-hidden>
      <div className="reel-window">
        <div
          className="reel-strip"
          style={{
            transform: `translateY(${-reel.offset * REEL_ITEM_H}px)`,
            transition: reel.animate ? `transform ${SPIN_MS - 400}ms cubic-bezier(.12,.75,.18,1)` : "none",
          }}
        >
          {items.map((l, i) => (
            <div key={i} className={`reel-item font-${l.font}`} style={{ height: REEL_ITEM_H }}>
              {l.label}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function Confetti() {
  const pieces = useMemo(
    () =>
      Array.from({ length: reducedMotion ? 0 : 26 }, (_, i) => ({
        emoji: ["😂", "🤣", "✨", "🎉", "😆", "💥"][i % 6],
        x: Math.random() * 100,
        dx: (Math.random() - 0.5) * 160,
        delay: Math.random() * 250,
        dur: 1100 + Math.random() * 900,
        size: 18 + Math.random() * 18,
      })),
    []
  );
  return (
    <div className="confetti" aria-hidden>
      {pieces.map((p, i) => (
        <span
          key={i}
          style={{
            left: `${p.x}%`,
            fontSize: p.size,
            "--dx": `${p.dx}px`,
            animationDelay: `${p.delay}ms`,
            animationDuration: `${p.dur}ms`,
          }}
        >
          {p.emoji}
        </span>
      ))}
    </div>
  );
}
