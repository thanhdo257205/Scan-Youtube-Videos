export interface VideoItem {
  id: string;
  title: string;
  description: string;
  tags: string[];
  publishedAt: string;
  durationSeconds: number;
  isShort: boolean;
  viewCount: number;
  likeCount: number;
  url: string;
}

export interface ClassifiedVideo extends VideoItem {
  topic: string;
  /** Visual style from thumbnail analysis (only set when style analysis ran). */
  style?: string;
  styleConfidence?: number;
}
