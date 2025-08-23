import BittorrentDHT from "bittorrent-dht";
import type Peer from "./peer";

type Callback = (
  error?: any | null,
  peerAddress?: string,
  peerPort?: number
) => void;

const LOGGER = require("log4js").getLogger("dht.js");
LOGGER.level = "debug";

const bootstrapNodes = [
  { address: "router.bittorrent.com", port: 6881 },
  { address: "router.utorrent.com", port: 6881 },
];

const hashes: Record<string, Callback> = {};

let dht: any;

const DHT = {
  init(callback?: Callback) {
    dht = new BittorrentDHT();

    dht.on("peer", (peer: { port: number; host: string }, infohash: string) =>
      handleNewPeer(infohash, peer)
    );

    dht.listen(null, () => {
      LOGGER.debug("Initialised DHT node on port %j", dht!.port);
      if (callback) {
        callback();
      }
    });
  },

  advertise(infohash: Buffer<ArrayBuffer>, callback: Callback) {
    hashes[infohash.toString()] = callback;
    dht.lookup(infohash);
  },
};

const handleNewPeer = (
  infohash: string,
  peer: { port: number; host: string }
) => {
  LOGGER.debug("Handling peer connection over DHT");

  if (peer.port <= 0 || peer.port >= 65536) {
    LOGGER.debug("Invalid peer socket %s:%s, ignoring.", peer.host, peer.port);
    return;
  }
  if (hashes[infohash]) {
    hashes[infohash](null, peer.host, peer.port);
  }
};

export default DHT;
