/** The logo: a rounded square with a gently rising line ending in a dot. */
export default function BrandMark({ size = 30 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
      <rect width="32" height="32" rx="9" fill="var(--accent)" />
      <path d="M6.5 21.5l6-6 4.2 3.8L25 10.5" fill="none" stroke="var(--accent-ink)" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="25" cy="10.5" r="2.4" fill="var(--accent-ink)" />
    </svg>
  );
}
