import { useId } from 'react';
import { Link } from 'react-router-dom';
import { cn } from '@/lib/utils';

/**
 * The one wordmark.
 *
 * Two brand systems are live at once (see BRAND.md), and the wordmark is the
 * place that showed: the landing page and V1 drew it in DM Serif Display with
 * an ember "brief", while the Console sidebar hand-rolled its own in Instrument
 * Serif with no logomark at all — a different logo on adjacent screens. The
 * split is real and deliberate, so it is a prop here rather than two
 * components, and every surface now renders the same geometry either way.
 */
interface LogoProps {
  size?: 'sm' | 'md' | 'lg' | 'xl';
  showText?: boolean;
  linkTo?: string;
  className?: string;
  /** Subtle ripple animation on the logomark (sound-wave metaphor) */
  animated?: boolean;
  /**
   * Which brand system to draw in. `legacy` is Warm Dispatch (DM Serif
   * Display + ember) for the landing page and the emails; `console` is the
   * app palette (Instrument Serif + terracotta). Explicit, because the
   * marketing surfaces stay Warm Dispatch while the app is on the Console.
   */
  variant?: 'legacy' | 'console';
  /** `dark` is for the sidebar and other dark panels, where the ink flips to white. */
  tone?: 'light' | 'dark';
}

const sizes = {
  sm: { svg: 24, text: 'text-[16px]' },
  md: { svg: 28, text: 'text-[19px]' },
  lg: { svg: 36, text: 'text-[24px]' },
  xl: { svg: 48, text: 'text-[32px]' },
};

function LogoMark({
  size = 'md',
  animated = true,
  variant = 'legacy',
}: { size?: LogoProps['size']; animated?: boolean; variant?: LogoProps['variant'] }) {
  const s = sizes[size!].svg;
  const uid = useId().replace(/:/g, '');
  const gradId = `echobrief-grad-${uid}`;

  return (
    <svg
      width={s}
      height={s}
      viewBox="0 0 32 32"
      aria-hidden="true"
      className={cn('shrink-0', animated && 'logo-mark-animated')}
    >
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" style={{ stopColor: variant === 'console' ? 'var(--eb-accent)' : 'var(--ember)' }} />
          <stop offset="100%" style={{ stopColor: variant === 'console' ? 'var(--eb-gold, var(--gold))' : 'var(--gold)' }} />
        </linearGradient>
      </defs>
      <circle
        className="logo-ring logo-ring-outer"
        cx="16"
        cy="16"
        r="14"
        fill="none"
        stroke={`url(#${gradId})`}
        strokeWidth="1.2"
        opacity="0.28"
      />
      <circle
        className="logo-ring logo-ring-mid"
        cx="16"
        cy="16"
        r="9"
        fill="none"
        stroke={`url(#${gradId})`}
        strokeWidth="1.2"
        opacity="0.52"
      />
      <circle className="logo-core" cx="16" cy="16" r="4.5" fill={`url(#${gradId})`} />
    </svg>
  );
}

export function Logo({
  size = 'md',
  showText = true,
  linkTo,
  className,
  animated = true,
  variant = 'legacy',
  tone = 'light',
}: LogoProps) {
  const console_ = variant === 'console';
  const inkColor = tone === 'dark' ? '#FFFFFF' : console_ ? 'var(--eb-text)' : 'var(--ink)';
  const accentColor = console_
    ? tone === 'dark'
      ? 'var(--eb-accent-sidebar)'
      : 'var(--eb-accent)'
    : 'var(--ember)';

  const content = (
    <span className={cn('inline-flex items-center gap-2.5', className)}>
      <LogoMark size={size} animated={animated} variant={variant} />
      {showText && (
        <span
          className={cn('leading-none', sizes[size].text)}
          style={{
            fontFamily: console_ ? 'var(--eb-font-logo)' : 'var(--font-brand-serif)',
            letterSpacing: '-0.04em',
          }}
        >
          <span style={{ color: inkColor, fontStyle: 'normal' }}>echo</span>
          <em style={{ color: accentColor, fontStyle: 'italic' }}>brief</em>
        </span>
      )}
    </span>
  );

  if (linkTo) {
    return (
      <Link to={linkTo} className="-my-1.5 inline-flex items-center py-1.5">
        {content}
      </Link>
    );
  }

  return content;
}

export { LogoMark };
