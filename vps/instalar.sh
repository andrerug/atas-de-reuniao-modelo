#!/bin/bash
# Instala ou atualiza o app Atas de Reunião na VPS (root, em /opt/atas).
set -euo pipefail
DOM=atas.seu-dominio.exemplo
PASTA=/opt/atas
log() { echo "[$(date +%H:%M:%S)] $*"; }

cd "$PASTA"
mkdir -p /var/lib/atas/arquivos
chown -R 1000:1000 /var/lib/atas
if [ ! -f /etc/atas.env ]; then
  # mesma chave do Gemini e mesmas contas do laboratório que o Transcritor
  grep -E '^(GEMINI_API_KEY|SUPABASE_URL|SUPABASE_ANON_KEY|SUPABASE_SERVICE_ROLE_KEY|ENDERECO_CONTA|MODELO_OPENROUTER_PADRAO)=' /etc/transcritor.env > /etc/atas.env || true
  chmod 600 /etc/atas.env
fi

log "1. montando a imagem"
docker compose build --pull -q
log "2. subindo o contêiner"
docker compose up -d
docker image prune -f >/dev/null 2>&1 || true

log "3. https em $DOM"
if ! grep -q "^$DOM" /etc/caddy/Caddyfile; then
  cat >> /etc/caddy/Caddyfile <<CADDY

$DOM {
	request_body {
		max_size 2GB
	}
	reverse_proxy 127.0.0.1:3101
	header {
		Strict-Transport-Security "max-age=31536000"
		X-Robots-Tag "noindex, nofollow"
	}
}
CADDY
  caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile >/dev/null 2>&1 && systemctl reload caddy
fi

for i in $(seq 1 20); do curl -fsS http://127.0.0.1:3101/api/sessao >/dev/null 2>&1 && break; sleep 2; done
curl -s http://127.0.0.1:3101/api/sessao; echo
log "PRONTO"
