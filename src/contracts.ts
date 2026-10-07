export type Scope = { type: 'all' } | { type: 'recent'; months: 1 | 3 | 6 | 12 } | { type: 'talk'; talkId: string };
export interface PublicTalk { id: string; title: string; speaker: string; track: string; description?: string }
export interface Citation {
  ref: number; talkId: string; eventId: string; releaseId: string; videoId: string;
  segmentIds: string[]; title: string; speaker: string; startMs: number; endMs: number; quote: string; available?: boolean;
}
export type ChatEvent =
  | { event: 'meta'; data: { requestId: string; conversationId: string; demo: boolean } }
  | { event: 'citations'; data: Citation[] }
  | { event: 'delta'; data: { text: string } }
  | { event: 'done'; data: { state: 'generating' | 'completed' | 'interrupted' | 'failed'; replay?: boolean } }
  | { event: 'error'; data: { message: string } };
