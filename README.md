# Shapes

Shapes is a responsive studio for original generative SVG art. Choose a pattern, adjust its geometry and colors, then export an editable SVG or a PNG. The browser renders the artwork and saves the current editing settings locally.

The header theme switch changes the editor between light and dark mode. Your theme choice is saved on this device.

## Run locally

Use Node.js 24.

```sh
npm ci
npm run dev
```

Open the `/shapes/` URL printed by Vite. To check the production build, run `npm run build` followed by `npm run preview`.

## Publish to GitHub Pages

1. Push the project to the `main` branch of `Saganaki22/shapes`.
2. In the project repository, set **Settings → Pages → Build and deployment → Source** to **GitHub Actions**. Leave the project custom domain blank so it inherits `drbaph.is-a.dev` from the existing user site.
3. Run **Build and deploy Shapes** from the repository’s Actions tab. Future pushes to `main` deploy automatically. The Vite base path is `/shapes/`.
4. Open [Shapes](https://drbaph.is-a.dev/shapes/) and verify that a direct refresh and both export formats work.

## License

Shapes is released under the [MIT License](LICENSE).
