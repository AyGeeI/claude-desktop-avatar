// Typvertrag der Mod „avatar“: die Werte, die sie in `$.state` hält.
// Die Hooks-Module importieren ihre Typen von hier (`../types`).

export type AvatarMood =
  | 'idle'
  | 'thinking'
  | 'working'
  | 'speaking'
  | 'attention'
  | 'success'
  | 'error'
  | 'sleeping';

export type PlanProgress = {
  done: number;
  total: number;
  current?: string;
};

export type SessionBrief = {
  id: string;
  project: string;
  mood: AvatarMood;
  step?: string;
  plan?: PlanProgress;
  needsYou: boolean;
  updatedAt: number;
  isSelf: boolean;
};

export type VoiceInfo = {
  name: string;
  culture: string;
};

export type CompanionStatus = 'off' | 'starting' | 'running' | 'failed' | 'unsupported';

export type AvatarView = {
  mood: AvatarMood;
  step?: string;
  plan?: PlanProgress;
  lastSaid?: string;
  lastAnswer?: string;
  attention?: string;
  sessions: SessionBrief[];
  companion: CompanionStatus;
  companionNote?: string;
  voices: VoiceInfo[];
  isSpeaker: boolean;
  updatedAt: number;
};

export type PanelTab = 'status' | 'look' | 'setup';

export type PanelState = {
  tab: PanelTab;
};

declare module 'claude-code' {
  interface PluginState {
    avatar: {
      view: Shaped<AvatarView>;
      panel: Shaped<PanelState>;
    };
  }
}
