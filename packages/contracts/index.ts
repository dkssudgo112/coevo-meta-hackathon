export type Assistance = 'independent' | 'coached' | 'ai-produced' | 'unobserved';
export type ContentFormat = 'note' | 'manual' | 'flashcards' | 'podcast' | 'short';

export interface WorkReference {
  projectId: string;
  sessionId: string;
  workId: string;
}

export interface Evidence {
  id: string;
  work: WorkReference;
  kind: 'user-request' | 'tool-result' | 'user-decision' | 'agent-report' | 'verification';
  sourceText: string;
  assistance: Assistance;
  observedAt: string;
  fixture: boolean;
}

export interface Readiness {
  service: 'coevo';
  mode: 'mock' | 'live';
  metaKeyConfigured: boolean;
  liveCallsEnabled: boolean;
  model: string;
  implementation: 'workspace-bootstrap';
}
