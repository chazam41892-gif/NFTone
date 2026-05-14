import { Tier } from "@prisma/client";

export const TIER_LIMITS = {
  FREE: {
    activeDrops: 3,
    storageMb: 250,
    lazyMintOnly: true,
    aiTools: false,
    analytics: "basic",
  },
  CREATOR: {
    activeDrops: 25,
    storageMb: 2000,
    lazyMintOnly: false,
    aiTools: true,
    analytics: "standard",
  },
  PRO: {
    activeDrops: 100,
    storageMb: 10000,
    lazyMintOnly: false,
    aiTools: true,
    analytics: "advanced",
  },
  LABEL: {
    activeDrops: 1000,
    storageMb: 100000,
    lazyMintOnly: false,
    aiTools: true,
    analytics: "label",
  },
  ENTERPRISE: {
    activeDrops: Infinity,
    storageMb: Infinity,
    lazyMintOnly: false,
    aiTools: true,
    analytics: "enterprise",
  },
} as const;

export function canCreateDrop(tier: Tier, activeDropCount: number) {
  return activeDropCount < TIER_LIMITS[tier].activeDrops;
}

export function requiresLazyMint(tier: Tier) {
  return TIER_LIMITS[tier].lazyMintOnly;
}
