# Aurora

Soft, glowing, grainy gradient wallpapers — generated on the GPU and exported at
your screen's exact resolution (or 4K / 2×).

**[Open Aurora →](https://nick-delirium.github.io/aurora/)**

- **Made for your screen** — detects your iPhone, iPad, Android phone or Mac and
  picks the right size; or choose any device or a custom size.
- **One tap to a new design** — shuffle shapes, pick a palette (or roll a random
  one), drag the image to reposition it.
- **Live mode** — the ribbon slowly drifts and breathes; save any moment you like.
- **Shareable** — every wallpaper is a link that recreates it exactly.
- **Liquid-glass UI** — real refraction rendered in the same shader as the
  wallpaper, in every browser including iOS Safari.

## Run locally

```sh
npm install
npm run dev         # http://localhost:5173
npm run dev:phone   # HTTPS on your network, to try it on a phone
npm run build       # type-check + production build in dist/
```

Pushing to `main` deploys to GitHub Pages (`.github/workflows/deploy.yml`).
How it works: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

The liquid-glass effect is a standalone, reusable package:
[`packages/liquid-glass`](packages/liquid-glass/README.md).

## License

[PolyForm Noncommercial 1.0.0](LICENSE) — free for personal, hobby, research,
educational and other noncommercial use, including changing and sharing it.
**Selling it or using it for any commercial purpose requires my written
permission** — open an issue or contact [@nick-delirium](https://github.com/nick-delirium).

