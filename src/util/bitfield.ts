/**
 * Object that represents a series of bits, i.e. 10001101.  Bits are stored
 * in order, left to right, for example
 *
 *   bits:  10001101
 *   index: 01234567
 */
class BitField {
  public bits: Uint8Array<ArrayBuffer>;
  public length: number;

  constructor(length: number);
  constructor(buffer: Buffer<ArrayBuffer>, length: number);
  constructor(bufferOrLength: Buffer<ArrayBuffer> | number, length?: number) {
    if (typeof bufferOrLength === "number") {
      this.bits = new Uint8Array(bufferOrLength);
    } else {
      this.bits = fromBuffer(bufferOrLength, length!);
    }

    this.length = this.bits.length;
  }

  set(index: number) {
    this.bits[index] = 1;
  }

  unset(index: number) {
    this.bits[index] = 0;
  }

  toBuffer() {
    const buffer = Buffer.alloc(Math.ceil(this.bits.length / 8));

    for (let i = 0; i < buffer.length; i++) {
      buffer[i] = 0;
    }

    for (let i = 0; i < this.bits.length; i++) {
      if (this.bits[i]) {
        const bit = 7 - (i % 8),
          byteIndex = ~~(i / 8);
        buffer[byteIndex] = buffer[byteIndex]! | Math.pow(2, bit);
      }
    }

    return buffer;
  }

  isSet(index: number) {
    return this.bits[index];
  }

  or(rhs: BitField) {
    const length = Math.min(this.length, rhs.length);
    const ret = new BitField(length);
    for (let i = 0; i < length; i++) {
      ret.bits[i] = this.bits[i]! | rhs.bits[i]!;
    }
    return ret;
  }

  xor(rhs: BitField) {
    const length = Math.min(this.length, rhs.length);
    const ret = new BitField(length);
    for (let i = 0; i < length; i++) {
      ret.bits[i] = this.bits[i]! ^ rhs.bits[i]!;
    }
    return ret;
  }

  and(rhs: BitField) {
    const length = Math.min(this.length, rhs.length);
    const ret = new BitField(length);
    for (let i = 0; i < length; i++) {
      ret.bits[i] = this.bits[i]! & rhs.bits[i]!;
    }
    return ret;
  }

  cardinality() {
    let count = 0;
    for (let i = 0; i < this.bits.length; i++) {
      if (this.bits[i]) {
        count++;
      }
    }
    return count;
  }

  setIndices() {
    const set = [];
    for (let i = 0; i < this.bits.length; i++) {
      if (this.bits[i]) {
        set.push(i);
      }
    }
    return set;
  }

  unsetIndices() {
    const unset = [];
    for (let i = 0; i < this.bits.length; i++) {
      if (!this.bits[i]) {
        unset.push(i);
      }
    }
    return unset;
  }

  setAll() {
    for (let i = 0; i < this.bits.length; i++) {
      this.set(i);
    }
  }

  unsetAll() {
    for (let i = 0; i < this.bits.length; i++) {
      this.unset(i);
    }
  }
}

const fromBuffer = (buffer: Buffer<ArrayBuffer>, length: number) => {
  const array = new Uint8Array(length);
  for (let i = 0; i < length; i++) {
    const bit = 7 - (i % 8),
      byteIndex = ~~(i / 8);
    array[i] = buffer[byteIndex]! & (Math.pow(2, bit) > 0 ? 1 : 0);
  }
  return array;
};

export default BitField;
