import { z } from "zod";
import { androidConnectionIdSchema } from "./android-connection-id.js";

export const androidPairStartSchema = z.object({
  connectionName: z.string().trim().min(1).max(120).optional(),
});

export type AndroidPairStart = z.infer<typeof androidPairStartSchema>;

export const androidPairConfirmSchema = z.object({
  login_id: z.string().uuid(),
  connection_id: androidConnectionIdSchema,
  device_id: z.string().trim().min(1).max(200),
  device_name: z.string().trim().min(1).max(200).optional(),
  app_version: z.string().trim().max(80).optional(),
});

export type AndroidPairConfirm = z.infer<typeof androidPairConfirmSchema>;

export const androidPairPollSchema = z.object({
  login_id: z.string().uuid(),
});

export type AndroidPairPoll = z.infer<typeof androidPairPollSchema>;
