import { GLOSSARY, type GlossaryKey } from "@/lib/glossary";

/** A word with a dotted underline that explains itself on hover or keyboard focus. */
export default function Term({ k, children }: { k: GlossaryKey; children: React.ReactNode }) {
  return (
    <span className="term" tabIndex={0} aria-describedby={undefined}>
      {children}
      <span className="tip" role="tooltip">{GLOSSARY[k]}</span>
    </span>
  );
}
