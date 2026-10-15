// App-icon style mark: continuous-corner squircle, green gradient, white sprout.
export default function Logo({ size = 32 }) {
  const id = `gmb-g-${size}`;
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true">
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#3ddc6e" />
          <stop offset="1" stopColor="#14834a" />
        </linearGradient>
      </defs>
      <path d="M32 0c19.4 0 32 4.6 32 32S51.4 64 32 64 0 59.4 0 32 12.6 0 32 0z" fill={`url(#${id})`} />
      <path d="M32 50V29" stroke="#fff" strokeWidth="4.5" strokeLinecap="round" />
      <path d="M32 32c0-9 7-15 16-15 0 9-7 15-16 15z" fill="#fff" />
      <path d="M32 38c0-7-6-12-13-12 0 7 6 12 13 12z" fill="#fff" opacity="0.72" />
    </svg>
  );
}
