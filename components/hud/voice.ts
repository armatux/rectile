export type VoiceState = "idle" | "listening" | "responding";

export const VOICE_COLOR: Record<VoiceState, string> = {
  idle: "rgb(217 210 236 / 0.5)",
  listening: "#b39cf5",
  responding: "#5acdf5",
};
