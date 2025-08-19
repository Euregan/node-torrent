export type Info = {
  name: string;
  pieces?: string;
  length?: number;
  "piece length"?: number;
  private?: 1;
  source?: string;
  files?: Array<{ length: number; path: Array<string> }>;
};

export type Metadata = {
  infoHash: Buffer<ArrayBuffer>;
  announce?: string;
  "announce-list": Array<string>;
  "created by"?: string;
  "creation date"?: number;
  comment?: string;
  info: Info;
};
