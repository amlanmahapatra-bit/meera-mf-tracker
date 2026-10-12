import type { PeerStanding } from "@/lib/status";
import Term from "./Term";

/** Next to a fund's name: bold green "Outperforming" when it beat the average of similar funds; a quiet note when it trailed. */
export default function StandingLabel({ standing }: { standing: PeerStanding | null }) {
  if (standing === "ahead") {
    return (
      <span className="inline-flex items-center gap-1 text-sm font-extrabold tracking-tight text-good">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 4l9 15H3z" /></svg>
        <Term k="outperforming">Outperforming</Term>
        <span className="sr-only"> similar funds this month</span>
      </span>
    );
  }
  if (standing === "behind") {
    return (
      <span className="inline-flex items-center gap-1 text-sm font-semibold text-warn">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 20L3 5h18z" /></svg>
        Behind similar funds
      </span>
    );
  }
  return null;
}
