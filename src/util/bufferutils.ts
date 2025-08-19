export const concat = (...buffers: Array<Buffer<ArrayBuffer>>) => {
  var length = 0;
  for (var i = 0; i < buffers.length; i++) {
    length += buffers[i]!.length;
  }
  var nb = Buffer.alloc(length);
  var pos = 0;
  for (var i = 0; i < buffers.length; i++) {
    var b = buffers[i]!;
    b.copy(nb, pos, 0);
    pos += b.length;
  }
  return nb;
};

export const equal = (b1: Buffer<ArrayBuffer>, b2: Buffer<ArrayBuffer>) => {
  if (b1.length != b2.length) {
    return false;
  }
  for (var i = 0; i < b1.length; i++) {
    if (b1[i] != b2[i]) {
      return false;
    }
  }
  return true;
};

export const fromInt = (int: number) => {
  var b = Buffer.alloc(4);
  b[0] = (int >> 24) & 0xff;
  b[1] = (int >> 16) & 0xff;
  b[2] = (int >> 8) & 0xff;
  b[3] = int & 0xff;
  return b;
};

export const readInt = (buffer: Buffer<ArrayBuffer>, offset: number) => {
  offset = offset || 0;
  return (
    (buffer[offset]! << 24) |
    (buffer[offset + 1]! << 16) |
    (buffer[offset + 2]! << 8) |
    buffer[offset + 3]!
  );
};

export const fromInt16 = (int: number) => {
  var b = Buffer.alloc(2);
  b[2] = (int >> 8) & 0xff;
  b[3] = int & 0xff;
  return b;
};

export const readInt16 = (buffer: Buffer<ArrayBuffer>, offset: number) => {
  offset = offset || 0;
  return (buffer[offset + 2]! << 8) | buffer[offset + 3]!;
};

export const slice = (
  buffer: Buffer<ArrayBuffer>,
  start: number,
  end?: number
) => {
  if (start < 0) start = 0;
  if (!end || end > buffer.length) end = buffer.length;

  var b = Buffer.alloc(end - start);
  buffer.copy(b, 0, start, end);
  return b;
};
