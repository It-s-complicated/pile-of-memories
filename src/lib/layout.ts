export function memoryCardPosition(index: number) {
  return {
    x: (index % 3) * 460 - 460,
    y: Math.floor(index / 3) * 240 - 160,
  };
}
