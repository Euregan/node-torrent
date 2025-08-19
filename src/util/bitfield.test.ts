import { describe, expect, test } from "bun:test";
import BitField from "./bitfield";

describe("A BitField set to 10101", () => {
  test("when calling `xor(BitField(00111))`", () => {
    const initialBitfield = new BitField(5);
    initialBitfield.set(0);
    initialBitfield.set(2);
    initialBitfield.set(4);

    var bitfield = new BitField(5);
    bitfield.set(2);
    bitfield.set(3);
    bitfield.set(4);

    const result = initialBitfield.xor(bitfield);

    expect(result.isSet(0)).toBe(1);
    expect(result.isSet(1)).toBe(0);
    expect(result.isSet(2)).toBe(0);
    expect(result.isSet(3)).toBe(1);
    expect(result.isSet(4)).toBe(0);
  });

  test("when calling `and(BitField(00111))`", () => {
    const initialBitfield = new BitField(5);
    initialBitfield.set(0);
    initialBitfield.set(2);
    initialBitfield.set(4);

    var bitfield = new BitField(5);
    bitfield.set(2);
    bitfield.set(3);
    bitfield.set(4);

    const result = initialBitfield.and(bitfield);

    expect(result.isSet(0)).toBe(0);
    expect(result.isSet(1)).toBe(0);
    expect(result.isSet(2)).toBe(1);
    expect(result.isSet(3)).toBe(0);
    expect(result.isSet(4)).toBe(1);
  });

  test("when calling `setIndices()`", () => {
    const bitfield = new BitField(5);
    bitfield.set(0);
    bitfield.set(2);
    bitfield.set(4);

    const result = bitfield.setIndices();

    expect(result[0]).toBe(0);
    expect(result[1]).toBe(2);
    expect(result[2]).toBe(4);
  });
});
