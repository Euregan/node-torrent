export type Data = {
  info_hash: Buffer<ArrayBufferLike>;
  peer_id: Buffer<ArrayBuffer>;
  port: number;
  uploaded?: number;
  downloaded?: number;
  left?: number;
};

export type TrackerInfo = {
  trackerId?: string;
  interval: number;
  seeders: number;
  leechers: number;
  peers: Array<{
    ip: string;
    port: number;
  }>;
};

export type Callback = (trackerInfo: TrackerInfo | null, error: any) => void;
