import { Tier } from "@prisma/client";

export default function TierBadge({ tier }: { tier: Tier }) {
  return (
    <span className="rounded-full border border-purple-400/40 bg-purple-500/10 px-3 py-1 text-sm text-purple-200">
      {tier}
    </span>
  );
}
