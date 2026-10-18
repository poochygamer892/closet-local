#!/usr/bin/env bash
set -euo pipefail

if [[ $# -ne 1 ]]; then
  echo "Uso: GOFILE_TOKEN=... $0 <archivo>" >&2
  exit 2
fi

artifact_path="$1"
if [[ ! -f "$artifact_path" ]]; then
  echo "No existe el archivo: $artifact_path" >&2
  exit 2
fi
if [[ -z "${GOFILE_TOKEN:-}" ]]; then
  echo "Define GOFILE_TOKEN con el token de tu cuenta Gofile para publicar el archivo." >&2
  exit 2
fi

server="$(curl --fail --silent --show-error https://api.gofile.io/servers \
  | node -e 'let d="";process.stdin.on("data",x=>d+=x).on("end",()=>{const j=JSON.parse(d);if(j.status!=="ok"||!j.data?.servers?.length)process.exit(1);process.stdout.write(j.data.servers[0].name)})')"

response="$(curl --fail --silent --show-error \
  --form-string "token=${GOFILE_TOKEN}" \
  --form "file=@${artifact_path};filename=$(basename "$artifact_path")" \
  "https://${server}.gofile.io/contents/uploadfile")"

download_url="$(printf '%s' "$response" | node -e 'let d="";process.stdin.on("data",x=>d+=x).on("end",()=>{const j=JSON.parse(d);if(j.status!=="ok"||!j.data?.downloadPage){console.error(`Gofile upload failed: ${j.status||"invalid response"}`);process.exit(1)}process.stdout.write(j.data.downloadPage)})')"
printf '%s\n' "$download_url"
