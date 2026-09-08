import type { Config } from "tailwindcss";
import tailwindcssAnimate from "tailwindcss-animate";
import typography from "@tailwindcss/typography";

export default {
  darkMode: ["class"],
  content: ["./pages/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./app/**/*.{ts,tsx}", "./src/**/*.{ts,tsx}"],
  prefix: "",
  theme: {
    container: {
      center: true,
      padding: "2rem",
      screens: {
        "2xl": "1400px",
      },
    },
    extend: {
      fontFamily: {
        // Warm Dispatch stack — Gambarino display, Switzer body, JetBrains Mono
        sans: ['Switzer', '-apple-system', 'BlinkMacSystemFont', 'system-ui', 'sans-serif'],
        heading: ['Gambarino', 'Cambria', 'Georgia', 'serif'],
        display: ['Gambarino', 'Cambria', 'Georgia', 'serif'],
        mono: ['JetBrains Mono', 'ui-monospace', 'SFMono-Regular', 'monospace'],
        // Legacy aliases kept so existing components don't break mid-migration
        brand: ['Switzer', 'sans-serif'],
        'brand-mono': ['JetBrains Mono', 'monospace'],
        indic: ['Noto Sans Devanagari', 'Switzer', 'sans-serif'],
        // Console (UI v2). Instrument Serif is deliberately NOT here — it is the
        // wordmark face only, reached via var(--eb-font-logo) in the lockup alone.
        outfit: ['Outfit', 'system-ui', 'sans-serif'],
        dmsans: ['DM Sans', 'system-ui', 'sans-serif'],
      },
      fontSize: {
        'xs': ['0.75rem', { lineHeight: '1rem' }],
        'sm': ['0.8125rem', { lineHeight: '1.25rem' }],
        'base': ['0.9375rem', { lineHeight: '1.55rem' }],
        'lg': ['1.0625rem', { lineHeight: '1.55rem' }],
        'xl': ['1.1875rem', { lineHeight: '1.75rem' }],
        '2xl': ['1.375rem', { lineHeight: '1.85rem' }],
        '3xl': ['1.75rem', { lineHeight: '2.1rem' }],
        '4xl': ['2.25rem', { lineHeight: '1.1' }],
        '5xl': ['3rem', { lineHeight: '1.05' }],
        '6xl': ['3.75rem', { lineHeight: '1.02' }],
        '7xl': ['4.5rem', { lineHeight: '1' }],
      },
      letterSpacing: {
        'dispatch': '0.22em',
      },
      colors: {
        // Warm Dispatch tokens (legacy ember/cream/ink kept for component compat,
        // but values now route through OKLCH CSS variables at runtime)
        ember: {
          DEFAULT: 'oklch(62% 0.18 40)',
          deep: 'oklch(52% 0.17 35)',
          hi: 'oklch(72% 0.15 45)',
          light: 'oklch(72% 0.15 45)',
          dark: 'oklch(42% 0.16 35)',
        },
        amber: {
          warm: 'oklch(78% 0.13 75)',
        },
        paper: {
          DEFAULT: 'oklch(97% 0.01 60)',
          raised: 'oklch(94% 0.012 55)',
          deep: 'oklch(91% 0.014 52)',
          card: 'oklch(99% 0.005 65)',
        },
        ink: {
          DEFAULT: 'oklch(18% 0.02 40)',
          mid: 'oklch(40% 0.018 42)',
          soft: 'oklch(58% 0.015 45)',
          faint: 'oklch(72% 0.01 50)',
          light: 'oklch(58% 0.015 45)',
        },
        char: {
          DEFAULT: 'oklch(16% 0.012 40)',
          raised: 'oklch(21% 0.014 40)',
          card: 'oklch(24% 0.015 40)',
        },
        bone: {
          DEFAULT: 'oklch(94% 0.012 60)',
          mid: 'oklch(78% 0.01 55)',
          soft: 'oklch(62% 0.01 50)',
        },
        rule: {
          DEFAULT: 'oklch(88% 0.015 50)',
          soft: 'oklch(93% 0.012 55)',
          dark: 'oklch(30% 0.018 42)',
        },
        // Legacy shim — code still references brand.orange/amber, ash
        brand: {
          orange: 'oklch(62% 0.18 40)',
          amber: 'oklch(78% 0.13 75)',
          'orange-light': 'oklch(72% 0.15 45)',
          'orange-dark': 'oklch(42% 0.16 35)',
        },
        gold: {
          DEFAULT: 'oklch(78% 0.13 75)',
          light: 'oklch(85% 0.11 80)',
        },
        cream: {
          DEFAULT: 'oklch(94% 0.012 55)',
          dark: 'oklch(88% 0.015 50)',
        },
        ash: {
          DEFAULT: 'oklch(58% 0.015 45)',
          light: 'oklch(72% 0.01 50)',
        },
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        recording: {
          DEFAULT: "hsl(var(--recording))",
          foreground: "hsl(var(--recording-foreground))",
        },
        success: {
          DEFAULT: "hsl(var(--success))",
          foreground: "hsl(var(--success-foreground))",
        },
        warning: {
          DEFAULT: "hsl(var(--warning))",
          foreground: "hsl(var(--warning-foreground))",
        },
        sidebar: {
          DEFAULT: "hsl(var(--sidebar-background))",
          foreground: "hsl(var(--sidebar-foreground))",
          primary: "hsl(var(--sidebar-primary))",
          "primary-foreground": "hsl(var(--sidebar-primary-foreground))",
          accent: "hsl(var(--sidebar-accent))",
          "accent-foreground": "hsl(var(--sidebar-accent-foreground))",
          border: "hsl(var(--sidebar-border))",
          ring: "hsl(var(--sidebar-ring))",
        },
        // ── Console (UI v2) ────────────────────────────────────────────
        eb: {
          bg: "var(--eb-bg)",
          card: "var(--eb-card)",
          "card-alt": "var(--eb-card-alt)",
          "row-hover": "var(--eb-row-hover)",
          border: "var(--eb-border)",
          divider: "var(--eb-divider)",
          chip: "var(--eb-chip)",
          "btn-bottom": "var(--eb-btn-bottom)",
          "toggle-track": "var(--eb-toggle-track)",
          "control-edge": "var(--eb-control-edge)",
          sidebar: "var(--eb-sidebar)",
          "sidebar-raised": "var(--eb-sidebar-raised)",
          text: "var(--eb-text)",
          prose: "var(--eb-text-prose)",
          secondary: "var(--eb-text-secondary)",
          muted: "var(--eb-text-muted)",
          "on-dark": "var(--eb-text-on-dark)",
          "group-label": "var(--eb-group-label)",
          "nav-icon": "var(--eb-nav-icon)",
          accent: "var(--eb-accent)",
          "accent-hover": "var(--eb-accent-hover)",
          "accent-top": "var(--eb-accent-top)",
          "accent-soft": "var(--eb-accent-soft)",
          "accent-text": "var(--eb-accent-text)",
          "accent-sidebar": "var(--eb-accent-sidebar)",
          "accent-bar": "var(--eb-accent-sidebar-bar)",
          green: "var(--eb-green)",
          "green-bg": "var(--eb-green-bg)",
          amber: "var(--eb-amber)",
          "amber-bg": "var(--eb-amber-bg)",
          "amber-text": "var(--eb-amber-text)",
          red: "var(--eb-red)",
          "red-bg": "var(--eb-red-bg)",
          "red-border": "var(--eb-red-border)",
          // live-recording dot ONLY. Success is eb-green.
          live: "var(--eb-live)",
          "code-fg": "var(--eb-code-fg)",
          "code-keyword": "var(--eb-code-keyword)",
          "code-string": "var(--eb-code-string)",
        },
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
        // Console (UI v2) shape language
        pill: "var(--eb-r-pill)",
        card: "var(--eb-r-card)",
        input: "var(--eb-r-input)",
        "input-lg": "var(--eb-r-input-lg)",
        tile: "var(--eb-r-tile)",
        code: "var(--eb-r-code)",
      },
      boxShadow: {
        "eb-card": "var(--eb-shadow-card)",
        "eb-btn": "var(--eb-shadow-btn)",
        "eb-primary": "var(--eb-shadow-primary)",
        "eb-dark": "var(--eb-shadow-dark)",
        "eb-input": "var(--eb-inset-input)",
      },
      keyframes: {
        "accordion-down": {
          from: { height: "0" },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: "0" },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
      },
    },
  },
  plugins: [tailwindcssAnimate, typography],
} satisfies Config;
