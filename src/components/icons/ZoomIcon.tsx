/**
 * The Zoom app mark, used wherever a calendar event's link is a Zoom link.
 * Third-party brand colours — not ours to restyle, which is why `size` is the
 * only prop and nothing here reads a brand token. Mirrors GoogleMeetIcon.
 */
export function ZoomIcon({ size = 16, className }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      className={className}
      aria-hidden="true"
      focusable="false"
    >
      <path
        fill="#2D8CFF"
        d="M16.4 3h15.2c5 0 7.4.6 9.6 1.8a11.5 11.5 0 0 1 5 5c1.2 2.2 1.8 4.6 1.8 9.6v9.2c0 5-.6 7.4-1.8 9.6a11.5 11.5 0 0 1-5 5c-2.2 1.2-4.6 1.8-9.6 1.8H16.4c-5 0-7.4-.6-9.6-1.8a11.5 11.5 0 0 1-5-5C.6 36 0 33.6 0 28.6v-9.2c0-5 .6-7.4 1.8-9.6a11.5 11.5 0 0 1 5-5C9 3.6 11.4 3 16.4 3Z"
      />
      <path
        fill="#FFFFFF"
        d="M11 18.6c0-1.4 1.1-2.6 2.6-2.6h10.7c2.9 0 5.2 2.3 5.2 5.2v7.9c0 1.4-1.1 2.6-2.6 2.6H16.2c-2.9 0-5.2-2.3-5.2-5.2v-7.9Zm26.7-1.5c.8-.6 1.9 0 1.9 1v11.8c0 1-1.1 1.6-1.9 1l-6.2-4.5a1.2 1.2 0 0 1-.5-1v-2.8c0-.4.2-.8.5-1l6.2-4.5Z"
      />
    </svg>
  );
}
