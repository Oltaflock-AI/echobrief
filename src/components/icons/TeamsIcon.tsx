/**
 * The Microsoft Teams mark, used wherever a calendar event's link is a Teams
 * link. Third-party brand colours — not ours to restyle, which is why `size` is
 * the only prop and nothing here reads a brand token. Mirrors GoogleMeetIcon.
 *
 * The official mark shades its overlaps with translucent black; at 16px those
 * passes are invisible, so they are dropped. Everything else — the shapes, the
 * two purples and the square's gradient — is Microsoft's own.
 */
export function TeamsIcon({ size = 16, className }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 2229 2074"
      className={className}
      aria-hidden="true"
      focusable="false"
    >
      <path
        fill="#5059C9"
        d="M1554.6 777.5h575.7c54.4 0 98.5 44.1 98.5 98.5v524.4c0 199.9-162.1 362-362 362h-1.7c-199.9 0-362-162.1-362-362V829c0-28.4 23-51.5 51.5-51.5Z"
      />
      <circle fill="#5059C9" cx="1943.8" cy="440.6" r="233.3" />
      <circle fill="#7B83EB" cx="1218.1" cy="336.9" r="336.9" />
      <path
        fill="#7B83EB"
        d="M1667.3 777.5H717c-53.7 1.3-96.3 45.9-95 99.7v598.1c-7.5 322.5 247.7 590.2 570.2 598 322.5-7.8 577.7-275.5 570.2-598V877.2c1.2-53.8-41.3-98.4-95.1-99.7Z"
      />
      <defs>
        <linearGradient id="eb-teams-square" x1="198.1" y1="683.2" x2="942.2" y2="1972" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#5A62C3" />
          <stop offset="0.5" stopColor="#4D55BD" />
          <stop offset="1" stopColor="#3940AB" />
        </linearGradient>
      </defs>
      <rect fill="url(#eb-teams-square)" x="0" y="777.5" width="1140.3" height="1140.3" rx="95" />
      <path
        fill="#FFFFFF"
        d="M820.2 1273.5H630.2v517.3H509.2v-517.3H320.1v-100.3h500.1v100.3Z"
      />
    </svg>
  );
}
