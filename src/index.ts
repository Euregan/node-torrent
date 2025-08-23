import Client from "./client";

const client = new Client({
  downloadPath: "E:\\tmp",
});

client.addTorrent("https://webtorrent.io/torrents/tears-of-steel.torrent");
