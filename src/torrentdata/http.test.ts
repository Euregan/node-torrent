import { expect, spyOn, test } from "bun:test";
import HttpMetadata from "./http";
import { resolve } from "path";

test("Can parse metadata over http", async () => {
  spyOn(global, "fetch").mockResolvedValueOnce({
    arrayBuffer: async () =>
      Bun.file(resolve(__dirname, "./tears-of-steel.torrent")).arrayBuffer(),
    status: 200,
    // @ts-expect-error
    headers: { get: () => "" },
  });

  const metadata = await HttpMetadata.load(
    "https://webtorrent.io/torrents/tears-of-steel.torrent"
  );

  expect(metadata).toMatchObject({
    announce: "udp://tracker.leechers-paradise.org:6969",
    "announce-list": [
      "udp://tracker.leechers-paradise.org:6969",
      "udp://tracker.coppersurfer.tk:6969",
      "udp://tracker.opentrackr.org:1337",
      "udp://explodie.org:6969",
      "udp://tracker.empire-js.us:1337",
      "wss://tracker.btorrent.xyz",
      "wss://tracker.openwebtorrent.com",
      "wss://tracker.fastcast.nz",
    ],
    comment: "WebTorrent <https://webtorrent.io>",
    "created by": "WebTorrent <https://webtorrent.io>",
    "creation date": 1490916654,
    encoding: "UTF-8",
    info: {
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
    },
    "url-list": ["https://webtorrent.io/torrents/"],
  });
});
