import * as BufferUtils from "./util/bufferutils";
import { Socket } from "net";

class Message {
  public code: MessageCode;
  public payload: Buffer<ArrayBuffer> | undefined;

  constructor(code: MessageCode, payload?: Buffer<ArrayBuffer> | null) {
    this.code = code;
    this.payload = payload;
  }

  writeTo(stream: Socket) {
    if (this.code === MessageCode.KEEPALIVE) {
      stream.write(BufferUtils.fromInt(0));
    } else {
      const length = 1 + (this.payload ? this.payload.length : 0);
      stream.write(BufferUtils.fromInt(length));

      const code = Buffer.alloc(1);
      code[0] = this.code;
      stream.write(code);

      if (this.payload) {
        stream.write(this.payload);
      }
    }
  }
}

export enum MessageCode {
  KEEPALIVE = -1,
  CHOKE = 0,
  UNCHOKE = 1,
  INTERESTED = 2,
  UNINTERESTED = 3,
  HAVE = 4,
  BITFIELD = 5,
  REQUEST = 6,
  PIECE = 7,
  CANCEL = 8,
  PORT = 9,
  EXTENDED = 20,
}

export const MESSAGE_EXTENDED_HANDSHAKE = "nt_handshake";
export const MESSAGE_EXTENDED_METADATA = "ut_metadata";

export default Message;
