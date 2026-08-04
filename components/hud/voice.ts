export type VoiceState = "idle" | "listening" | "responding";

export const VOICE_COLOR: Record<VoiceState, string> = {
  idle: "rgb(235 235 245 / 0.5)",
  listening: "#0a84ff",
  responding: "#64d2ff",
};
