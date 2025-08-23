import * as bencode from "../util/bencode";
import BitField from "../util/bitfield";
import Metadata from "../metadata";
import Peer, { PeerEvent } from "../peer";
import Torrent, { TorrentStatus } from "../torrent/torrent";

const LOGGER = require("log4js").getLogger("extension/metadata.js");
LOGGER.level = "debug";

const EXTENSION_KEY = "ut_metadata";

enum MessageCode {
  REQUEST = 0,
  DATA = 1,
  REJECT = 2,
}

class MetadataExtension {
  static EXTENSION_KEY = EXTENSION_KEY;

  private _metadata: Metadata;
  private _torrent: Torrent;
  private _activePeers: Record<string, Array<number>>;
  private _activePieces: null | BitField;
  private _peers: Array<Peer>;

  private addPeerEventHandler: typeof this._addPeer;
  private peerDisconnectEventHandler: typeof this._peerDisconnect | null = null;
  private peerReadyEventHandler: typeof this._peerReady | null = null;

  constructor(torrent: Torrent) {
    this._metadata = new Metadata(torrent.infoHash!);
    this._torrent = torrent;
    this._activePeers = {};
    this._activePieces = null;
    this._peers = [];

    this.addPeerEventHandler = this._addPeer.bind(this);
    torrent.on(TorrentStatus.PEER, this.addPeerEventHandler);
  }

  handleMessage(peer: Peer, payload: Buffer<ArrayBuffer>) {
    LOGGER.debug(
      "Peer [%s] notified of metadata message.",
      peer.getIdentifier()
    );

    const decodedPayload = bencode.decode<
      Array<{ msg_type: number; piece: number }>
    >(payload.toString("binary"), true);
    const messageDetail = decodedPayload[0]!;
    const messageType = messageDetail["msg_type"];
    const activePieces = this._activePieces;

    switch (messageType) {
      case MessageCode.REQUEST: {
        LOGGER.debug(
          "Peer [%s] ignoring REQUEST message.",
          peer.getIdentifier()
        );
        break;
      }

      case MessageCode.DATA: {
        LOGGER.debug("Peer [%s] recieved DATA message.", peer.getIdentifier());

        if (this._metadata.isComplete()) {
          LOGGER.debug("Metadata already complete, ignoring data.");
          return;
        }

        const piece = messageDetail["piece"];
        this._cleanupPieceRequest(peer, piece);
        this._activePieces!.set(piece);
        this._metadata.setPiece(
          piece,
          payload.slice(
            // @ts-expect-error
            decodedPayload[1]
          )
        );

        if (this._metadata.isComplete()) {
          this._torrent.setMetadata(this._metadata);
          this._torrent.removeListener(
            TorrentStatus.PEER,
            this.addPeerEventHandler
          );
          let peer;
          while ((peer = this._peers.shift())) {
            peer.removeListener(
              PeerEvent.DISCONNECT,
              this.peerDisconnectEventHandler!
            );
            peer.removeListener(PeerEvent.READY, this.peerReadyEventHandler!);
          }
        }
        break;
      }

      case MessageCode.REJECT: {
        LOGGER.debug(
          "Peer [%s] recieved REJECT message.",
          peer.getIdentifier()
        );
        const piece = messageDetail["piece"];
        this._cleanupPieceRequest(peer, piece);
        activePieces!.unset(piece);
        break;
      }

      default: {
        LOGGER.warn(
          "Peer [%s] sent unknown metadata message.  messageType = %j",
          peer.getIdentifier(),
          messageType
        );
      }
    }
  }

  _addPeer(peer: Peer) {
    LOGGER.debug(
      "addPeer, hasMetadata: %j, supportsExtension: %j",
      this._torrent.hasMetadata(),
      peer.supportsExtension(EXTENSION_KEY)
    );
    if (!this._torrent.hasMetadata()) {
      if (peer.supportsExtension(EXTENSION_KEY)) {
        this._peers.push(peer);
        this.peerDisconnectEventHandler = this._peerDisconnect.bind(this);
        this.peerReadyEventHandler = this._peerReady.bind(this);
        peer.on(PeerEvent.DISCONNECT, this.peerDisconnectEventHandler);
        peer.on(PeerEvent.READY, this.peerReadyEventHandler);
        if (peer.isReady()) {
          this._peerReady(peer);
        }
      } else {
        const self = this;
        peer.once(PeerEvent.EXTENSIONS_UPDATED, function () {
          self._addPeer(peer);
        });
      }
    }
  }

  _cleanupPieceRequest(peer: Peer, piece: number) {
    let requestedPieces = this._activePeers[peer.getIdentifier()];
    const pieceIndex = requestedPieces!.indexOf(piece);
    if (pieceIndex > -1) {
      requestedPieces = requestedPieces!
        .slice(0, pieceIndex)
        .concat(requestedPieces!.slice(pieceIndex + 1));
      this._activePeers[peer.getIdentifier()] = requestedPieces;
    }
  }

  _peerDisconnect(peer: Peer) {
    // TODO: not cleaning up peer from _peers

    const requestedPieces = this._activePeers[peer.getIdentifier()];
    const activePieces = this._activePieces;

    if (requestedPieces) {
      requestedPieces.forEach(function (index) {
        activePieces!.unset(index);
      });
    }
    peer.removeListener(PeerEvent.DISCONNECT, this.peerDisconnectEventHandler!);
    peer.removeListener(PeerEvent.READY, this.peerReadyEventHandler!);
  }

  _peerReady(peer: Peer) {
    LOGGER.debug(
      "Peer [%s] ready.  metadata complete: %j ",
      peer.getIdentifier(),
      this._metadata.isComplete()
    );

    if (!this._metadata.isComplete()) {
      const metadata = this._metadata;
      const activePeers = this._activePeers;
      let activePieces = this._activePieces;
      let availableBlocks = activePieces && activePieces.unsetIndices();
      let pieceToRequest = -1;

      if (!metadata.hasLength()) {
        metadata.setLength(peer._extensionData!["metadata_size"]);
        this._activePieces = activePieces = new BitField(
          metadata.bitfield!.length
        );
        availableBlocks = activePieces.unsetIndices();
      }

      pieceToRequest =
        availableBlocks![
          Math.round(Math.random() * (availableBlocks!.length - 1))
        ]!;

      LOGGER.debug(
        "Peer [%s] requesting piece %j",
        peer.getIdentifier(),
        pieceToRequest
      );

      if (!activePeers[peer.getIdentifier()]) {
        activePeers[peer.getIdentifier()] = [];
      }
      activePeers[peer.getIdentifier()]!.push(pieceToRequest);

      peer.sendExtendedMessage(EXTENSION_KEY, {
        msg_type: MessageCode.REQUEST,
        piece: pieceToRequest,
      });
    }
  }
}

export default MetadataExtension;
