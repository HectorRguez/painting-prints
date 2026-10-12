// Center the visible ink without changing the source used for printing.
export function inkOffset({ data, width, height }) {
  let left = width, right = -1, top = height, bottom = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (data[(y * width + x) * 4 + 3] > 8) {
        left = Math.min(left, x);
        right = Math.max(right, x);
        top = Math.min(top, y);
        bottom = y;
      }
    }
  }
  return bottom < 0 ? { x: 0, y: 0 } : {
    x: (width - left - right - 1) / (2 * width) * 100,
    y: (height - top - bottom - 1) / (2 * height) * 100,
  };
}
