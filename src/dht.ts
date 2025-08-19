import dht from "dht.js";
import { EventEmitter } from "events";
import type Peer from "./peer";

type DhtNode = {
  port: number;
  connect: (node: { address: string; port: number }) => void;
  advertise: (hash: Buffer<ArrayBuffer>) => void;
} & EventEmitter;

type Callback = (
  error?: any | null,
  peerAddress?: string,
  peerPort?: number
) => void;

const LOGGER = require("log4js").getLogger("dht.js");

const bootstrapNodes = [
  { address: "router.bittorrent.com", port: 6881 },
  { address: "router.utorrent.com", port: 6881 },
];

let node: DhtNode | null = null;
const hashes: Record<string, Callback> = {};

const DHT = {
  init(callback?: Callback) {
    node = dht.node.create() as unknown as DhtNode;

    node.on("peer:new", handleNewPeer);

    node.on("error", function (error) {
      LOGGER.error("Error recieved from DHT node. error = " + error);
      console.log(error);
    });

    node.once("listening", function () {
      LOGGER.debug("Initialised DHT node on port %j", node!.port);
      bootstrapNodes.forEach((bootstrapNode) => {
        LOGGER.debug(
          "Connecting to node at " +
            bootstrapNode.address +
            ":" +
            bootstrapNode.port
        );
        node!.connect(bootstrapNode);
      });
      if (callback) {
        callback();
      }
    });
  },

  advertise(infohash: Buffer<ArrayBuffer>, callback: Callback) {
    hashes[infohash.toString()] = callback;
    node!.advertise(infohash);
  },
};

const handleNewPeer = (infohash: string, peer: Peer, isAdvertised: boolean) => {
  LOGGER.debug("Handling peer connection over DHT");
  if (!isAdvertised) {
    LOGGER.debug("Incoming peer connection not advertised, ignoring.");
    return;
  }
  if (peer.port! <= 0 || peer.port! >= 65536) {
    LOGGER.debug(
      "Invalid peer socket %s:%s, ignoring.",
      peer.address,
      peer.port
    );
    return;
  }
  if (hashes[infohash]) {
    hashes[infohash](null, peer.address, peer.port);
  }
};

export default DHT;
