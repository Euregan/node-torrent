import * as log4js from "log4js";
import { createServer, Server, Socket } from "net";
import dht from "./dht";
import Peer, { PeerEvent } from "./peer";
import Torrent, { TorrentStatus } from "./torrent/torrent";
import type MetadataExtension from "./extension/metadata";

const LOGGER = log4js.getLogger("client.js");

/**
 * Create a new torrent client.
 *
 * Options:
 * { id: '-NT0000-' || Buffer,
 *   downloadPath: '.',
 *   portRange: { start: 6881, end: 6889 },
 *   logLevel: 'TRACE' || 'DEBUG' || 'INFO' || ... }
 */
class Client {
  public torrents: Record<string, Torrent>;
  public port: number;
  public id: Buffer<ArrayBuffer>;
  public downloadPath: string;

  private extensions;
  private server;

  constructor(options?: {
    id?: Buffer<ArrayBuffer>;
    downloadPath?: string;
    portRange?: { start: number; end: number };
  }) {
    options = options || {};

    log4js.getLogger().level = "warn";

    const id = options.id || "-NT0010-";
    if (id instanceof Buffer) {
      if (id.length !== 20) {
        throw new Error("Client ID must be 20 bytes");
      }
      this.id = id;
    } else {
      this.id = padId(id as string);
    }

    this.torrents = {};
    this.downloadPath = options.downloadPath || ".";
    this.server = createServer(this.handleConnection.bind(this));
    this.port = listen(this.server, options.portRange);

    this.extensions = [require("./extension/metadata")];

    dht.init();
  }

  public addExtension(ExtensionClass: typeof MetadataExtension) {
    this.extensions.push(ExtensionClass);
  }

  addTorrent(url: string) {
    const torrent = new Torrent(
      this.id,
      this.port,
      this.downloadPath,
      url,
      this.extensions.slice(0)
    );

    torrent.once(TorrentStatus.INFO_HASH, (infoHash) => {
      LOGGER.debug("Received info hash event from torrent, starting.");
      if (!this.torrents[infoHash]) {
        this.torrents[infoHash] = torrent;
      }
      torrent.start();
    });

    return torrent;
  }

  removeTorrent(torrent: Torrent) {
    if (this.torrents[torrent.infoHash!.toString()]) {
      this.torrents[torrent.infoHash!.toString()]!.stop();
      delete this.torrents[torrent.infoHash!.toString()];
    }
  }

  private handleConnection(stream: Socket) {
    const peer = new Peer(stream);
    peer.once(PeerEvent.CONNECT, (infoHash) => {
      const torrent = this.torrents[infoHash];
      if (torrent) {
        peer.setTorrent(torrent);
      } else {
        peer.disconnect("Peer attempting to download unknown torrent.");
      }
    });
  }
}

const listen = (server: Server, portRange?: { start: number; end: number }) => {
  const setPortRange = portRange || { start: null, end: null };

  let connected = false;
  let port = setPortRange.start || 6881;
  const endPort = setPortRange.end || port + 8;

  do {
    // Handling error
    server.on("error", (err) => {
      LOGGER.error(err.message);
    });

    server.listen(port);
    connected = true;
    LOGGER.info("Listening for connections on %j", server.address());
  } while (!connected && port++ != endPort);

  if (!connected) {
    throw new Error(
      "Could not listen on any ports in range " + port + " - " + endPort
    );
  }
  return port;
};

const padId = (id: string) => {
  const newId = Buffer.alloc(20);
  newId.write(id, 0, "ascii");

  const start = id.length;
  for (let i = start; i < 20; i++) {
    newId[i] = Math.floor(Math.random() * 255);
  }
  return newId;
};

export default Client;
