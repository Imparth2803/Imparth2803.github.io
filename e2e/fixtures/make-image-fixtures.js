/* Recreates the image test files in this folder, drawn in a real browser.
   Run: node e2e/fixtures/make-image-fixtures.js */
const fs = require("fs");
const path = require("path");
const {chromium} = require("@playwright/test");

const dir = __dirname;

/* Inserts an EXIF block with the given orientation straight after the
   JPEG's start marker, like a phone camera does. */
function withOrientation(jpeg, orientation) {
  const tiff = [
    0x4d,
    0x4d,
    0,
    0x2a,
    0,
    0,
    0,
    8,
    0,
    1,
    0x01,
    0x12,
    0,
    3,
    0,
    0,
    0,
    1,
    0,
    orientation,
    0,
    0,
    0,
    0,
    0,
    0
  ];
  const body = [0x45, 0x78, 0x69, 0x66, 0, 0, ...tiff];
  const app1 = Buffer.from([
    0xff,
    0xe1,
    (body.length + 2) >> 8,
    (body.length + 2) & 0xff,
    ...body
  ]);
  return Buffer.concat([jpeg.subarray(0, 2), app1, jpeg.subarray(2)]);
}

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const draw = (fn, args) =>
    page
      .evaluate(
        async ({source, args}) => {
          // eslint-disable-next-line no-new-func
          const make = new Function("args", `return (${source})(args)`);
          const {canvas, type, quality} = make(args);
          const blob = await new Promise(resolve =>
            canvas.toBlob(resolve, type, quality)
          );
          return Array.from(new Uint8Array(await blob.arrayBuffer()));
        },
        {source: fn.toString(), args}
      )
      .then(bytes => Buffer.from(bytes));

  // 400 x 300 with a different colour in each corner, stored sideways:
  // orientation 6 means "turn 90° clockwise to view", so it shows as 300 x 400.
  const quadrants = await draw(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 400;
    canvas.height = 300;
    const ctx = canvas.getContext("2d");
    [
      ["#ff0000", 0, 0],
      ["#00ff00", 200, 0],
      ["#0000ff", 0, 150],
      ["#ffff00", 200, 150]
    ].forEach(([c, x, y]) => {
      ctx.fillStyle = c;
      ctx.fillRect(x, y, 200, 150);
    });
    return {canvas, type: "image/jpeg", quality: 0.95};
  });
  fs.writeFileSync(
    path.join(dir, "rotated-photo.jpg"),
    withOrientation(quadrants, 6)
  );

  // See-through background with a solid circle.
  fs.writeFileSync(
    path.join(dir, "transparent.png"),
    await draw(() => {
      const canvas = document.createElement("canvas");
      canvas.width = 300;
      canvas.height = 200;
      const ctx = canvas.getContext("2d");
      ctx.fillStyle = "#4f46e5";
      ctx.beginPath();
      ctx.arc(150, 100, 80, 0, Math.PI * 2);
      ctx.fill();
      return {canvas, type: "image/png"};
    })
  );

  // A "screenshot": flat colours and text, which shrinks a lot with fewer colours.
  fs.writeFileSync(
    path.join(dir, "screenshot.png"),
    await draw(() => {
      const canvas = document.createElement("canvas");
      canvas.width = 900;
      canvas.height = 600;
      const ctx = canvas.getContext("2d");
      const g = ctx.createLinearGradient(0, 0, 900, 0);
      g.addColorStop(0, "#eef2ff");
      g.addColorStop(1, "#fdf2f8");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, 900, 600);
      ctx.fillStyle = "#1f2937";
      ctx.font = "20px sans-serif";
      for (let i = 0; i < 18; i++)
        ctx.fillText(
          `Row ${i + 1}: Quarterly report, region ${i % 5}, status OK`,
          40,
          50 + i * 30
        );
      ctx.fillStyle = "#4f46e5";
      ctx.fillRect(620, 40, 240, 120);
      return {canvas, type: "image/png"};
    })
  );

  // A detailed "photo": soft gradients plus fine noise (hard to compress).
  const photo = () => {
    const canvas = document.createElement("canvas");
    canvas.width = 1600;
    canvas.height = 1200;
    const ctx = canvas.getContext("2d");
    const img = ctx.createImageData(1600, 1200);
    let seed = 7;
    const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647) * 40;
    for (let y = 0; y < 1200; y++)
      for (let x = 0; x < 1600; x++) {
        const i = (y * 1600 + x) * 4;
        img.data[i] = (x / 1600) * 200 + rand();
        img.data[i + 1] = (y / 1200) * 180 + rand();
        img.data[i + 2] = 120 + rand();
        img.data[i + 3] = 255;
      }
    ctx.putImageData(img, 0, 0);
    return canvas;
  };
  fs.writeFileSync(
    path.join(dir, "photo.jpg"),
    await draw(
      `() => ({canvas: (${photo.toString()})(), type: "image/jpeg", quality: 0.95})`
    )
  );
  fs.writeFileSync(
    path.join(dir, "photo.webp"),
    await draw(
      `() => ({canvas: (${photo.toString()})(), type: "image/webp", quality: 0.9})`
    )
  );

  await browser.close();

  // A JPEG that starts correctly but is cut short and filled with junk.
  fs.writeFileSync(
    path.join(dir, "damaged.jpg"),
    Buffer.concat([quadrants.subarray(0, 200), Buffer.alloc(300, 0x41)])
  );
  // Text saved with an image name.
  fs.writeFileSync(
    path.join(dir, "not-an-image.png"),
    "This is a text file, not a picture.\n"
  );
})();
