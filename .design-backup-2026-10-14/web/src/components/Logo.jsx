export default function Logo({ size = 32 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true">
      <rect width="64" height="64" rx="16" fill="var(--forest)" />
      <path d="M32 50V28" stroke="var(--lime)" strokeWidth="5" strokeLinecap="round" />
      <path d="M32 32c0-9 7-15 16-15 0 9-7 15-16 15z" fill="var(--lime)" />
      <path d="M32 38c0-7-6-12-13-12 0 7 6 12 13 12z" fill="var(--mint)" />
    </svg>
  );
}
