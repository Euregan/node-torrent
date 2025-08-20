import BitField from "../util/bitfield";
import Peer, { PeerEvent } from "../peer";
import Piece, { PieceState } from "../piece";
import Torrent, { TorrentStatus } from "./torrent";

const LOGGER = require("log4js").getLogger("torrent/requestmanager.js");

class RequestManager {
  private _activePieces: BitField | null;
  private _bitfield: BitField | null;
  private _peers: Array<Peer>;
  private _pieces: Array<Piece> | null;
  private _torrent: Torrent;

  private peerDisconnectEventHandler: typeof this._peerDisconnect | null = null;
  private peerReadyEventHandler: typeof this._peerReady | null = null;

  constructor(torrent: Torrent) {
    this._activePieces = null;
    this._bitfield = null;
    this._peers = [];
    this._pieces = null;
    this._torrent = torrent;

    torrent.once(TorrentStatus.READY, this._torrentReady.bind(this));
    torrent.on(TorrentStatus.PEER, this._addPeer.bind(this));
  }

  private _addPeer(peer: Peer) {
    LOGGER.debug("adding peer %s", peer.getIdentifier());
    this._peers.push(peer);

    this.peerDisconnectEventHandler = this._peerDisconnect.bind(this);
    this.peerReadyEventHandler = this._peerReady.bind(this);
    peer.on(PeerEvent.DISCONNECT, this.peerDisconnectEventHandler);
    peer.on(PeerEvent.READY, this.peerReadyEventHandler);
  }

  private _peerDisconnect(peer: Peer) {
    LOGGER.debug("_peerDisconnect: " + peer.getIdentifier());

    // TODO: review...

    const activePieces = this._activePieces!;

    Object.keys(peer.pieces).forEach((key) => {
      activePieces.unset(peer.pieces[key]);
    });
    peer.pieces = {};
    peer.removeListener(PeerEvent.DISCONNECT, this.peerDisconnectEventHandler!);
    peer.removeListener(PeerEvent.READY, this.peerReadyEventHandler!);
  }

  private _peerReady(peer: Peer) {
    LOGGER.debug("_peerReady: " + peer.getIdentifier());

    if (!this._torrent.hasMetadata()) {
      LOGGER.debug(
        "Peer [%s] has no metadata, ignoring for now.",
        peer.getIdentifier()
      );
      return;
    }
    if (!this._bitfield) {
      LOGGER.debug("RequestManager not initialised, ignoring peer for now.");
      return;
    }

    const activePieces = this._activePieces!.setIndices();
    let nextPiece = null;
    // find an active piece for the peer
    activePieces.some((pieceIndex) => {
      const piece = this._pieces![pieceIndex]!;
      if (!piece.hasRequestedAllChunks() && peer.bitfield!.isSet(piece.index)) {
        nextPiece = piece;
        return piece;
      }
    });

    if (!nextPiece) {
      // if no active piece found, pick a new piece and activate it

      // available = peerhas ^ (peerhas & (active | completed))
      const available = peer.bitfield!.xor(
        peer.bitfield!.and(this._activePieces!.or(this._bitfield))
      );

      // pick a random piece out of the available ones
      const set = available.setIndices();
      const index = set[Math.round(Math.random() * (set.length - 1))];
      if (index !== undefined) {
        nextPiece = this._pieces![index];
        this._activePieces!.set(index);
      }
    }
    if (nextPiece) {
      LOGGER.debug(
        "Peer [%s] ready, requesting piece %d",
        peer.getIdentifier(),
        nextPiece.index
      );
      peer.requestPiece(nextPiece);
    } else if (peer.numRequests === 0) {
      LOGGER.debug("No available pieces for peer %s", peer.getIdentifier());
      peer.setAmInterested(false);
    }
  }

  private _pieceComplete(piece: Piece) {
    LOGGER.debug("pieceComplete: " + piece.index);
    this._bitfield!.set(piece.index);
  }

  private _torrentReady() {
    const torrent = this._torrent;
    LOGGER.debug("_torrentReady");
    this._bitfield = torrent.bitfield;
    this._activePieces = new BitField(this._bitfield!.length);
    this._pieces = torrent._pieces!;

    const requestManager = this;
    this._pieces.forEach((piece) => {
      piece.once(
        PieceState.COMPLETE,
        requestManager._pieceComplete.bind(requestManager, piece)
      );
    });

    this._peers.forEach((peer) => {
      if (peer.isReady()) {
        requestManager._peerReady(peer);
      }
    });
  }
}

export default RequestManager;
