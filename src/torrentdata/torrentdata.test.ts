import { describe, expect, spyOn, test } from "bun:test";
import { resolve } from "node:path";
import TorrentData from "./torrentdata";

describe("Can parse any torrent metadata", () => {
  test("Can parse a file's metadata", async () => {
    const [metadata, trackers] = await TorrentData.load(
      "file://" + resolve(__dirname, "./tears-of-steel.torrent")
    );

    expect(metadata._metadata).toMatchObject({
      files: [
        {
          length: 4850,
          path: ["Tears of Steel.de.srt"],
        },
        {
          length: 4755,
          path: ["Tears of Steel.en.srt"],
        },
        {
          length: 4944,
          path: ["Tears of Steel.es.srt"],
        },
        {
          length: 4618,
          path: ["Tears of Steel.fr.srt"],
        },
        {
          length: 4746,
          path: ["Tears of Steel.it.srt"],
        },
        {
          length: 4531,
          path: ["Tears of Steel.nl.srt"],
        },
        {
          length: 9558,
          path: ["Tears of Steel.no.srt"],
        },
        {
          length: 5933,
          path: ["Tears of Steel.ru.srt"],
        },
        {
          length: 571346576,
          path: ["Tears of Steel.webm"],
        },
        {
          length: 35996,
          path: ["poster.jpg"],
        },
      ],
      name: "Tears of Steel",
      "piece length": 524288,
    });
    expect(metadata.infoHash).toMatchObject(expect.any(Buffer));
    expect(trackers).toHaveLength(8);
    expect(trackers.map((tracker) => tracker.url.href)).toMatchObject([
      "udp://tracker.leechers-paradise.org:6969",
      "udp://tracker.coppersurfer.tk:6969",
      "udp://tracker.opentrackr.org:1337",
      "udp://explodie.org:6969",
      "udp://tracker.empire-js.us:1337",
      "wss://tracker.btorrent.xyz",
      "wss://tracker.openwebtorrent.com",
      "wss://tracker.fastcast.nz",
    ]);
  });

  test("Can parse a magnet link", async () => {
    const [metadata, trackers] = await TorrentData.load(
      "magnet:?xt=urn:btih:209c8226b299b308beaf2b9cd3fb49212dbd13ec&dn=Tears+of+Steel&tr=udp%3A%2F%2Fexplodie.org%3A6969&tr=udp%3A%2F%2Ftracker.coppersurfer.tk%3A6969&tr=udp%3A%2F%2Ftracker.empire-js.us%3A1337&tr=udp%3A%2F%2Ftracker.leechers-paradise.org%3A6969&tr=udp%3A%2F%2Ftracker.opentrackr.org%3A1337&tr=wss%3A%2F%2Ftracker.btorrent.xyz&tr=wss%3A%2F%2Ftracker.fastcast.nz&tr=wss%3A%2F%2Ftracker.openwebtorrent.com&ws=https%3A%2F%2Fwebtorrent.io%2Ftorrents%2F&xs=https%3A%2F%2Fwebtorrent.io%2Ftorrents%2Ftears-of-steel.torrent"
    );

    expect(metadata._metadata).toMatchObject({
      name: "Tears of Steel",
    });
    expect(metadata.infoHash).toMatchObject(expect.any(Buffer));
    expect(trackers).toHaveLength(8);
    expect(trackers.map((tracker) => tracker.url.href)).toMatchObject([
      "udp://explodie.org:6969",
      "udp://tracker.coppersurfer.tk:6969",
      "udp://tracker.empire-js.us:1337",
      "udp://tracker.leechers-paradise.org:6969",
      "udp://tracker.opentrackr.org:1337",
      "wss://tracker.btorrent.xyz",
      "wss://tracker.fastcast.nz",
      "wss://tracker.openwebtorrent.com",
    ]);
  });

  test("Can parse metadata over http", async () => {
    spyOn(global, "fetch").mockResolvedValueOnce({
      arrayBuffer: async () =>
        Bun.file(resolve(__dirname, "./tears-of-steel.torrent")).arrayBuffer(),
      status: 200,
      // @ts-expect-error
      headers: { get: () => "" },
    });

    const [metadata, trackers] = await TorrentData.load(
      "https://webtorrent.io/torrents/tears-of-steel.torrent"
    );

    expect(metadata._metadata).toMatchObject({
      files: [
        {
          length: 4850,
          path: ["Tears of Steel.de.srt"],
        },
        {
          length: 4755,
          path: ["Tears of Steel.en.srt"],
        },
        {
          length: 4944,
          path: ["Tears of Steel.es.srt"],
        },
        {
          length: 4618,
          path: ["Tears of Steel.fr.srt"],
        },
        {
          length: 4746,
          path: ["Tears of Steel.it.srt"],
        },
        {
          length: 4531,
          path: ["Tears of Steel.nl.srt"],
        },
        {
          length: 9558,
          path: ["Tears of Steel.no.srt"],
        },
        {
          length: 5933,
          path: ["Tears of Steel.ru.srt"],
        },
        {
          length: 571346576,
          path: ["Tears of Steel.webm"],
        },
        {
          length: 35996,
          path: ["poster.jpg"],
        },
      ],
      name: "Tears of Steel",
      "piece length": 524288,
    });
    expect(metadata.infoHash).toMatchObject(expect.any(Buffer));
    expect(trackers).toHaveLength(8);
    expect(trackers.map((tracker) => tracker.url.href)).toMatchObject([
      "udp://tracker.leechers-paradise.org:6969",
      "udp://tracker.coppersurfer.tk:6969",
      "udp://tracker.opentrackr.org:1337",
      "udp://explodie.org:6969",
      "udp://tracker.empire-js.us:1337",
      "wss://tracker.btorrent.xyz",
      "wss://tracker.openwebtorrent.com",
      "wss://tracker.fastcast.nz",
    ]);
  });
});
