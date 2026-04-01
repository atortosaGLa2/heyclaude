import express from 'express';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

export function startWebServer(port: number = 7339): void {
  const app = express();

  // Serve from src/web (development: index.html lives here)
  app.use(express.static(join(__dirname, '..', '..', 'src', 'web')));

  // Also serve from dist/web if built
  app.use(express.static(join(__dirname, '..', 'web')));

  app.listen(port, () => {
    process.stderr.write(`[heyclaude] web UI at http://localhost:${port}\n`);
  });
}
