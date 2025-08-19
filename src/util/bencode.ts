type Encodable =
  | number
  | string
  | Array<Encodable>
  | { [key: string]: Encodable };

/**
 * Original source:
 *   https://github.com/WizKid/node-bittorrent/blob/master/lib/bencode.js
 */
class Decoder {
  private pos: number;
  private content: string;

  constructor(content: string) {
    this.pos = 0;
    this.content = content;
  }

  decode(ignoreRemainder: boolean) {
    const ret = this._decode();
    if (ignoreRemainder) {
      return [ret, this.pos];
    }
    if (this.pos !== this.content.length) {
      throw (
        "Wrongly formatted bencoding string. Tried to parse something it didn't understood " +
        this.pos +
        ", " +
        this.content.length
      );
    }

    return ret;
  }

  private _decode(): any {
    if (this.pos >= this.content.length)
      throw "Wrongly formatted bencoding string. Pos have passed the length of the string.";

    let ret;
    const c = this.content.charAt(this.pos);
    switch (c) {
      // Integer
      case "i": {
        const s = this.pos + 1;
        while (
          this.pos < this.content.length &&
          this.content.charAt(this.pos) != "e"
        )
          this.pos++;

        this.pos++;
        ret = parseInt(this.content.substring(s, this.pos));
        break;
      }

      // Dict
      case "d":
        ret = {};
        this.pos++;
        while (
          this.pos < this.content.length &&
          this.content.charAt(this.pos) != "e"
        ) {
          const key = this._decode();
          if (typeof key !== "string") throw "Keys in dict must be strings";
          // @ts-expect-error
          ret[key] = this._decode();
        }

        this.pos++;
        break;

      // List
      case "l":
        ret = [];
        this.pos++;
        while (
          this.pos < this.content.length &&
          this.content.charAt(this.pos) != "e"
        )
          ret.push(this._decode());

        this.pos++;
        break;

      // String
      case "0":
      case "1":
      case "2":
      case "3":
      case "4":
      case "5":
      case "6":
      case "7":
      case "8":
      case "9": {
        let s = this.pos;
        while (
          this.pos < this.content.length &&
          this.content.charAt(this.pos) != ":"
        )
          this.pos++;

        const len = parseInt(this.content.substring(s, this.pos));
        s = this.pos + 1;
        this.pos = s + len;
        ret = this.content.substring(s, this.pos);
        break;
      }

      default:
        throw (
          "Can't decode. No type starts with: " +
          c +
          ", at position " +
          this.pos
        );
    }

    return ret;
  }
}

export const encode = (encodable: Encodable) => {
  switch (encodable.constructor) {
    case Number:
      if (Math.round(encodable as number) !== encodable)
        throw "Numbers can only contain integers and not floats";

      return "i" + encodable.toString() + "e";

    case String:
      return (encodable as string).length + ":" + encodable;

    case Array: {
      let ret = "l";
      for (const item of encodable as Array<Encodable>) {
        ret += encode(item);
      }
      ret += "e";

      return ret;
    }

    case Object: {
      let ret = "d";
      for (const k in encodable as Record<string, Encodable>) {
        ret +=
          encode(k) +
          encode(
            // @ts-expect-error
            encodable[k]
          );
      }
      ret += "e";

      return ret;
    }

    default:
      throw "Bencode can only encode integers, strings, lists and dicts";
  }
};

export const decode = <T extends Encodable = Encodable>(
  content: string,
  ignoreRemainder: boolean = false
): T => new Decoder(content).decode(ignoreRemainder);
