import { z } from "zod";

export const rightsDeclarationSchema = z.object({
  masterOwner: z.string().min(1),
  publishingOwner: z.string().optional(),
  songwriterSplits: z.any().optional(),
  producerSplits: z.any().optional(),
  featuredSplits: z.any().optional(),
  sampleDisclosure: z.string().optional(),
  commercialAllowed: z.boolean().default(false),
  fanCollectibleOnly: z.boolean().default(true),
  exclusiveLicense: z.boolean().default(false),
  attestation: z.literal(true, {
    errorMap: () => ({
      message:
        "Artist must confirm they own or have permission to monetize this audio.",
    }),
  }),
});
