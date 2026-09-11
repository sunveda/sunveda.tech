// Inspect ISO BMFF metadata through bounded R2 range reads; never load the video into memory.
// MP4 and QuickTime MOV only. This verifies declared container duration, not decoded frames.
export async function inspectVideo(bucket, key, size) {
  let budget = 256;
  const read = async (offset, length) => {
    if (--budget < 0 || offset < 0 || length > 128 || offset + length > size)
      throw new Error("Invalid video metadata.");
    const object = await bucket.get(key, { range: { offset, length } });
    if (!object) throw new Error("Video is missing.");
    const buffer = await object.arrayBuffer();
    if (buffer.byteLength !== length)
      throw new Error("Incomplete video metadata.");
    return new DataView(buffer);
  };
  const text = (view, offset, length) =>
    String.fromCharCode(...new Uint8Array(view.buffer, offset, length));
  async function boxes(start, end) {
    const result = [];
    while (start < end) {
      if (end - start < 8) throw new Error("Invalid video container.");
      let header = 8;
      const view = await read(start, 8);
      let length = view.getUint32(0);
      const type = text(view, 4, 4);
      if (length === 1) {
        const extended = await read(start + 8, 8);
        length = Number(extended.getBigUint64(0));
        header = 16;
      } else if (length === 0) length = end - start;
      if (
        !Number.isSafeInteger(length) ||
        length < header ||
        start + length > end
      )
        throw new Error("Invalid video box.");
      result.push({ type, start: start + header, end: start + length });
      start += length;
    }
    return result;
  }
  async function duration(box) {
    if (!box || box.end - box.start < 20)
      throw new Error("Video duration is missing.");
    const version = (await read(box.start, 1)).getUint8(0);
    const length = version === 1 ? 32 : 20;
    if (version > 1 || box.end - box.start < length)
      throw new Error("Unsupported video duration.");
    const view = await read(box.start, length);
    const scale = view.getUint32(version === 1 ? 20 : 12);
    const ticks =
      version === 1 ? Number(view.getBigUint64(24)) : view.getUint32(16);
    const seconds = ticks / scale;
    if (!scale || !Number.isFinite(seconds) || seconds <= 0 || seconds > 480)
      throw new Error("Choose a video no longer than 8 minutes.");
    return seconds;
  }
  const top = await boxes(0, size);
  const ftyp = top.find((box) => box.type === "ftyp");
  if (!ftyp || ftyp.end - ftyp.start < 8)
    throw new Error("Choose an MP4 or MOV video.");
  const brand = text(await read(ftyp.start, 4), 0, 4);
  if (
    ![
      "isom",
      "iso2",
      "iso4",
      "iso5",
      "iso6",
      "mp41",
      "mp42",
      "avc1",
      "M4V ",
      "qt  ",
      "MSNV",
    ].includes(brand)
  )
    throw new Error("This video format is not supported. Choose MP4 or MOV.");
  const moov = top.find((box) => box.type === "moov");
  if (!moov || !top.some((box) => box.type === "mdat"))
    throw new Error("Video metadata is missing.");
  // Fragmented MP4 duration requires inspecting fragment timelines; reject rather than trust a misleading header.
  if (top.some((box) => box.type === "moof"))
    throw new Error("Export this video as a regular MP4 or MOV and try again.");
  const movie = await boxes(moov.start, moov.end);
  if (movie.some((box) => box.type === "mvex"))
    throw new Error("Fragmented videos are not supported.");
  const seconds = await duration(movie.find((box) => box.type === "mvhd"));
  let videoTrack = false;
  for (const track of movie.filter((box) => box.type === "trak")) {
    const children = await boxes(track.start, track.end);
    const media = children.find((box) => box.type === "mdia");
    if (!media) continue;
    const details = await boxes(media.start, media.end);
    const handler = details.find((box) => box.type === "hdlr");
    if (
      handler &&
      handler.end - handler.start >= 12 &&
      text(await read(handler.start + 8, 4), 0, 4) === "vide"
    ) {
      await duration(details.find((box) => box.type === "mdhd"));
      videoTrack = true;
    }
  }
  if (!videoTrack) throw new Error("The file has no supported video track.");
  return seconds;
}
