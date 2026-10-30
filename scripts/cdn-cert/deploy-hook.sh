#!/bin/sh
set -eu
if [ "${RENEWED_LINEAGE:-}" = /etc/letsencrypt/live/cc.abeiai.com ]; then
  /bin/systemctl start abei-cdn-cert-sync.service
fi
