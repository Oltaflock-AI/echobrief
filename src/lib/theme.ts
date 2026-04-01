// ─── Warm Ember Design Tokens ───
// EchoBrief Brand Guidelines compliant
// Fonts: Outfit for headings, DM Sans for body
// Colors: Orange 500 (#F97316), Amber 500 (#F59E0B), Stone palette
// Green 500 for recording states, Purple 500 for AI/insights
// 12px border-radius on CTAs

export const T = {
  // Backgrounds
  bg: "#0C0A09",           // Stone 950
  bgCard: "#1C1917",       // Stone 900
  bgCardH: "#292524",      // Stone 800 (hover)
  
  // Borders
  border: "#292524",       // Stone 800
  borderL: "#44403C",      // Stone 700 (lighter)
  
  // Text
  text: "#FAFAF9",         // Stone 50
  textS: "#A8A29E",        // Stone 400 (secondary)
  textM: "#78716C",        // Stone 500 (muted)
  
  // Brand Colors
  orange: "#F97316",       // Orange 500 - Primary accent
  amber: "#F59E0B",        // Amber 500 - Secondary accent
  orangeL: "#FB923C",      // Orange 400 - Light variant
  orangeD: "#EA580C",      // Orange 600 - Dark variant
  
  // Semantic Colors
  green: "#22C55E",        // Green 500 - Recording states, success
  blue: "#3B82F6",         // Blue 500 - Info, links
  purple: "#A855F7",       // Purple 500 - AI/insights badges
  red: "#EF4444",          // Red 500 - Errors, risks
  
  // Gradient
  gradient: "linear-gradient(135deg, #F97316, #F59E0B)",
} as const;

// CSS variable mapping for Tailwind integration
export const themeVariables = {
  '--echobrief-bg': T.bg,
  '--echobrief-bg-card': T.bgCard,
  '--echobrief-bg-card-hover': T.bgCardH,
  '--echobrief-border': T.border,
  '--echobrief-border-light': T.borderL,
  '--echobrief-text': T.text,
  '--echobrief-text-secondary': T.textS,
  '--echobrief-text-muted': T.textM,
  '--echobrief-orange': T.orange,
  '--echobrief-amber': T.amber,
  '--echobrief-orange-light': T.orangeL,
  '--echobrief-orange-dark': T.orangeD,
  '--echobrief-green': T.green,
  '--echobrief-blue': T.blue,
  '--echobrief-purple': T.purple,
  '--echobrief-red': T.red,
};

// Helper function to get opacity variants
export function withOpacity(color: string, opacity: number): string {
  // Convert hex to rgba
  const hex = color.replace('#', '');
  const r = parseInt(hex.substring(0, 2), 16);
  const g = parseInt(hex.substring(2, 4), 16);
  const b = parseInt(hex.substring(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${opacity})`;
}

// Status color mapping
export const statusColors = {
  completed: { bg: "#FFF7ED", color: "#C2410C", label: "Completed" },
  processing: { bg: "#DBEAFE", color: "#1D4ED8", label: "Processing" },
  recording: { bg: "#DCFCE7", color: "#15803D", label: "Recording" },
  failed: { bg: "#FEE2E2", color: "#B91C1C", label: "Failed" },
  scheduled: { bg: "#F5F5F4", color: "#78716C", label: "Scheduled" },
} as const;

// Source badge colors
export const sourceColors = {
  Bot: { color: T.purple, bg: withOpacity(T.purple, 0.12) },
  Extension: { color: T.orangeL, bg: withOpacity(T.orange, 0.1) },
} as const;

// Language options for the app
export const SUPPORTED_LANGUAGES = [
  "English",
  "Hindi", 
  "Tamil",
  "Telugu",
  "Bengali",
  "Marathi",
  "Kannada",
  "Malayalam",
  "Gujarati",
  "Punjabi",
  "Odia",
  "Assamese",
  "Urdu",
] as const;

export type SupportedLanguage = typeof SUPPORTED_LANGUAGES[number];
