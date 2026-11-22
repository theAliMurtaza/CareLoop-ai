#!/bin/sh
set -eu

# Run from the image's WORKDIR (/app). Never start the API after failed setup.
node api/dist/db/cli.js --seed
exec node api/dist/server.js
