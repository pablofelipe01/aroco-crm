#!/usr/bin/env bash
# Setup cloudflared tunnel para los 3 MCPs de AROCO.
# Correr en el servidor AROCO (donde corren stonex-mcp, barchart-mcp, inventory-mcp).
#
# Pre-requisito: ya tienes cuenta Cloudflare y un dominio delegado ahí.
# Si no: https://dash.cloudflare.com/sign-up + agregar dominio (5 min con NS change).
#
# Uso: ./setup.sh tudominio.com
set -euo pipefail

DOMAIN="${1:-}"
TUNNEL_NAME="${TUNNEL_NAME:-cacaoq-mcp}"

if [[ -z "$DOMAIN" ]]; then
    echo "Uso: $0 <dominio>"
    echo "Ejemplo: $0 aroco.com"
    exit 1
fi

# ─── 1. Instalar cloudflared ───────────────────────────────────────────
if ! command -v cloudflared >/dev/null; then
    echo "[1/6] Instalando cloudflared..."
    # Detectar OS
    if [[ -f /etc/debian_version ]]; then
        curl -fsSL https://pkg.cloudflare.com/cloudflare-main.gpg | sudo tee /usr/share/keyrings/cloudflare-main.gpg >/dev/null
        echo 'deb [signed-by=/usr/share/keyrings/cloudflare-main.gpg] https://pkg.cloudflare.com/cloudflared bookworm main' | sudo tee /etc/apt/sources.list.d/cloudflared.list
        sudo apt-get update && sudo apt-get install -y cloudflared
    elif [[ -f /etc/redhat-release ]]; then
        curl -fsSL https://pkg.cloudflare.com/cloudflared-ascii.repo | sudo tee /etc/yum.repos.d/cloudflared.repo
        sudo yum install -y cloudflared
    else
        echo "OS no detectado. Instala manualmente: https://pkg.cloudflare.com/"
        exit 1
    fi
else
    echo "[1/6] cloudflared ya instalado: $(cloudflared --version)"
fi

# ─── 2. Login (abre navegador en el server o muestra URL) ──────────────
if [[ ! -f ~/.cloudflared/cert.pem ]]; then
    echo "[2/6] Autenticando con Cloudflare (abre el link en cualquier navegador)..."
    cloudflared tunnel login
else
    echo "[2/6] Ya hay sesión Cloudflare (~/.cloudflared/cert.pem existe)"
fi

# ─── 3. Crear tunnel ───────────────────────────────────────────────────
if ! cloudflared tunnel list | grep -q "^.* $TUNNEL_NAME "; then
    echo "[3/6] Creando tunnel '$TUNNEL_NAME'..."
    cloudflared tunnel create "$TUNNEL_NAME"
else
    echo "[3/6] Tunnel '$TUNNEL_NAME' ya existe"
fi

TUNNEL_ID=$(cloudflared tunnel list | awk -v name="$TUNNEL_NAME" '$2 == name {print $1; exit}')
echo "    TUNNEL_ID=$TUNNEL_ID"

# ─── 4. Generar config.yml en /etc/cloudflared/ ────────────────────────
echo "[4/6] Escribiendo /etc/cloudflared/config.yml..."
sudo mkdir -p /etc/cloudflared
sudo cp "$HOME/.cloudflared/$TUNNEL_ID.json" /etc/cloudflared/
sudo tee /etc/cloudflared/config.yml >/dev/null <<EOF
tunnel: $TUNNEL_ID
credentials-file: /etc/cloudflared/$TUNNEL_ID.json
loglevel: info

ingress:
  - hostname: stonex-mcp.$DOMAIN
    service: http://localhost:8770
    originRequest:
      connectTimeout: 30s
      keepAliveTimeout: 90s
  - hostname: barchart-mcp.$DOMAIN
    service: http://localhost:8769
    originRequest:
      connectTimeout: 30s
      keepAliveTimeout: 90s
  - hostname: inventory-mcp.$DOMAIN
    service: http://localhost:8771
    originRequest:
      connectTimeout: 30s
      keepAliveTimeout: 90s
  - service: http_status:404
EOF

# ─── 5. Crear DNS records (CNAME → tunnel) ─────────────────────────────
echo "[5/6] Creando DNS records..."
for sub in stonex-mcp barchart-mcp inventory-mcp; do
    cloudflared tunnel route dns "$TUNNEL_NAME" "$sub.$DOMAIN" || true
done

# ─── 6. Instalar como systemd service ──────────────────────────────────
echo "[6/6] Registrando systemd service..."
sudo cloudflared service install
sudo systemctl enable cloudflared
sudo systemctl restart cloudflared

sleep 2
sudo systemctl status cloudflared --no-pager | head -20

echo ""
echo "─────────────────────────────────────────────"
echo "Tunnel '$TUNNEL_NAME' activo. URLs:"
echo "  https://stonex-mcp.$DOMAIN/mcp"
echo "  https://barchart-mcp.$DOMAIN/mcp"
echo "  https://inventory-mcp.$DOMAIN/mcp"
echo ""
echo "PRÓXIMO PASO: configurar Cloudflare Access en el dashboard"
echo "(Zero Trust → Access → Applications → Add Application)"
echo "para cada uno de los 3 hostnames, atándolos a un Service Token."
echo "─────────────────────────────────────────────"
