/**
 * Custom server for Railway: bind to 0.0.0.0 and process.env.PORT.
 * Start: npm run start (after next build).
 */
const { createServer } = require("http");
const { parse } = require("url");
const next = require("next");

const dev = process.env.NODE_ENV !== "production";
const hostname = "0.0.0.0";
const rawPort = process.env.PORT ?? "3000";
const port = Number.parseInt(String(rawPort), 10);

if (Number.isNaN(port) || port < 1 || port > 65535) {
  console.error("Invalid PORT:", process.env.PORT);
  process.exit(1);
}

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

app
  .prepare()
  .then(() => {
    createServer((req, res) => {
      try {
        const parsedUrl = parse(req.url, true);
        handle(req, res, parsedUrl);
      } catch (err) {
        console.error("Request handler error", err);
        res.statusCode = 500;
        res.end("internal server error");
      }
    }).listen(port, hostname, (err) => {
      if (err) {
        throw err;
      }
      console.log(`> Ready on http://${hostname}:${port}`);
    });
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
