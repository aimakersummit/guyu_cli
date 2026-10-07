/** 独立客户端使用的公开接口类型，不依赖网站后端。 */
export type Scope =
  | { type: 'all' }
  | { type: 'recent'; months: 1 | 3 | 6 | 12 }
  | { type: 'talk'; talkId: string };
export interface PublicTalk {
  id: string;
  title: string;
  speaker: string;
  track: string;
  description?: string;
}
export interface Citation {
  ref: number;
  talkId: string;
  title: string;
  speaker: string;
  startMs: number;
  endMs: number;
  quote: string;
}
export type ChatEvent =
  | { event: 'meta'; data: { requestId: string; conversationId: string; demo: boolean } }
  | { event: 'citations'; data: Citation[] }
  | { event: 'delta'; data: { text: string } }
  | { event: 'done'; data: { state: string; replay?: boolean } }
  | { event: 'error'; data: { message: string } };
