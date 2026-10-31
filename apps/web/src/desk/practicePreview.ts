import type { Assistance, DraftReading, DraftVerdict, Ingredients, PracticeScene } from '../../../../packages/contracts/index.ts';

/** Public recording contains only the fictional exercise, with no workspace identity or transport credentials. */
export interface RecordedDraft {
  brief: string;
  ingredients: Ingredients;
  checkNote: string;
  reading: DraftReading;
  assistance: Assistance;
  image: string;
}

export interface RecordedPractice {
  recordedOn: string;
  scenario: string;
  scene: PracticeScene;
  inputOrigin: 'scripted';
  outputOrigin: 'live-model';
  recordedJudgment: { verdict: DraftVerdict; fix: keyof Ingredients | null };
  first: RecordedDraft;
  revision: RecordedDraft;
}
