import { describe, expect, test } from "bun:test";
import MagnetMetadata from "./magnet";

test("Can parse a magnet link", async () => {
  const metadata = await MagnetMetadata.load(
    "magnet:?xt=urn:btih:209c8226b299b308beaf2b9cd3fb49212dbd13ec&dn=Tears+of+Steel&tr=udp%3A%2F%2Fexplodie.org%3A6969&tr=udp%3A%2F%2Ftracker.coppersurfer.tk%3A6969&tr=udp%3A%2F%2Ftracker.empire-js.us%3A1337&tr=udp%3A%2F%2Ftracker.leechers-paradise.org%3A6969&tr=udp%3A%2F%2Ftracker.opentrackr.org%3A1337&tr=wss%3A%2F%2Ftracker.btorrent.xyz&tr=wss%3A%2F%2Ftracker.fastcast.nz&tr=wss%3A%2F%2Ftracker.openwebtorrent.com&ws=https%3A%2F%2Fwebtorrent.io%2Ftorrents%2F&xs=https%3A%2F%2Fwebtorrent.io%2Ftorrents%2Ftears-of-steel.torrent"
  );
  expect(metadata).toMatchObject({
    "announce-list": [
      "udp://explodie.org:6969",
      "udp://tracker.coppersurfer.tk:6969",
      "udp://tracker.empire-js.us:1337",
      "udp://tracker.leechers-paradise.org:6969",
      "udp://tracker.opentrackr.org:1337",
      "wss://tracker.btorrent.xyz",
      "wss://tracker.fastcast.nz",
      "wss://tracker.openwebtorrent.com",
    ],
    info: {
      name: "Tears of Steel",
    },
    infoHash: expect.any(Buffer),
  });
});
