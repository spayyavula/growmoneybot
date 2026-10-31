// Joke data. Jokes live one file per language in ./jokes/; each joke is a string whose
// lines are separated by " | ", expanded here into a list so dialogue renders one speaker per line.
import en from "./jokes/en.js";
import hi from "./jokes/hi.js";
import te from "./jokes/te.js";
import ta from "./jokes/ta.js";

export const LANGUAGES = [
  { id: "en", label: "English", short: "EN", font: "latin" },
  { id: "hi", label: "हिन्दी", short: "हि", font: "devanagari" },
  { id: "te", label: "తెలుగు", short: "తె", font: "telugu" },
  { id: "ta", label: "தமிழ்", short: "த", font: "tamil" },
];

export const CATEGORIES = [
  { id: "school", emoji: "🏫", color: "#ff6b6b", label: { en: "School", hi: "स्कूल", te: "బడి", ta: "பள்ளி" } },
  { id: "doctor", emoji: "🩺", color: "#4dabf7", label: { en: "Doctor", hi: "डॉक्टर", te: "డాక్టర్", ta: "டாக்டர்" } },
  { id: "family", emoji: "👨‍👩‍👧", color: "#ffa94d", label: { en: "Family", hi: "परिवार", te: "కుటుంబం", ta: "குடும்பம்" } },
  { id: "food", emoji: "🍛", color: "#69db7c", label: { en: "Food", hi: "खाना", te: "భోజనం", ta: "சாப்பாடு" } },
  { id: "tech", emoji: "💻", color: "#9775fa", label: { en: "Tech", hi: "टेक", te: "టెక్", ta: "டெக்" } },
  { id: "money", emoji: "💰", color: "#ffd43b", label: { en: "Money", hi: "पैसा", te: "డబ్బు", ta: "பணம்" } },
];

const expand = (byCategory) =>
  Object.entries(byCategory).flatMap(([cat, jokes]) => jokes.map((text) => ({ cat, lines: text.split(" | ") })));

export const JOKES = { en: expand(en), hi: expand(hi), te: expand(te), ta: expand(ta) };
