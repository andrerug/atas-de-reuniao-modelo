# Instala o conector MCP "atas" no Claude Desktop e no Claude Code deste computador.
# Pede a chave gerada em atas.seu-dominio.exemplo -> Configuração -> "Chave para o Claude".
# Faz cópia de segurança de cada arquivo de configuração antes de mudar.
$ErrorActionPreference = 'Stop'
$aqui = Split-Path -Parent $MyInvocation.MyCommand.Path
$origem = Join-Path $aqui 'dist\atas-mcp.mjs'
if (-not (Test-Path $origem)) { Write-Host 'Falta mcp\dist\atas-mcp.mjs. Rode antes: npm run build:mcp'; exit 1 }
$node = (Get-Command node -ErrorAction SilentlyContinue).Source
if (-not $node) { Write-Host 'O Node.js não está instalado. Instale em nodejs.org e rode de novo.'; exit 1 }

$seguro = Read-Host 'Cole a chave (atas_...)' -AsSecureString
$chave = [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($seguro)).Trim()
if ($chave -notmatch '^atas_[0-9a-f]{64}$') { Write-Host 'Essa não parece a chave do app (começa com atas_ e tem 69 caracteres).'; exit 1 }

# 1. o conector fica numa pasta fixa do usuário
$pasta = Join-Path $env:LOCALAPPDATA 'atas-mcp'
New-Item -ItemType Directory -Force $pasta | Out-Null
Copy-Item $origem (Join-Path $pasta 'atas-mcp.mjs') -Force
$script = (Join-Path $pasta 'atas-mcp.mjs')

$entrada = [ordered]@{
  command = $node
  args    = @($script)
  env     = [ordered]@{ ATAS_URL = 'https://atas.seu-dominio.exemplo'; ATAS_CHAVE = $chave }
}

function Gravar-Servidor($arquivo) {
  if (Test-Path $arquivo) {
    Copy-Item $arquivo "$arquivo.antes-atas" -Force
    $cfg = Get-Content $arquivo -Raw -Encoding UTF8 | ConvertFrom-Json
  } else {
    New-Item -ItemType Directory -Force (Split-Path -Parent $arquivo) | Out-Null
    $cfg = [pscustomobject]@{}
  }
  if (-not $cfg.PSObject.Properties['mcpServers']) { $cfg | Add-Member -NotePropertyName mcpServers -NotePropertyValue ([pscustomobject]@{}) }
  if ($cfg.mcpServers.PSObject.Properties['atas']) { $cfg.mcpServers.PSObject.Properties.Remove('atas') }
  $cfg.mcpServers | Add-Member -NotePropertyName atas -NotePropertyValue ([pscustomobject]$entrada)
  $json = $cfg | ConvertTo-Json -Depth 50
  [IO.File]::WriteAllText($arquivo, $json, (New-Object Text.UTF8Encoding $false))
  Write-Host "  ok: $arquivo"
}

Write-Host 'Registrando o conector "atas":'
# 2. Claude Desktop (aba Chat)
Gravar-Servidor (Join-Path $env:APPDATA 'Claude\claude_desktop_config.json')
# 3. Claude Code (aba Code e terminal), escopo do usuário
Gravar-Servidor (Join-Path $env:USERPROFILE '.claude.json')

Write-Host ''
Write-Host 'Pronto. Feche e abra o Claude de novo. Depois peça, por exemplo: "liste as minhas atas".'
Write-Host 'As configurações anteriores ficaram salvas com o final .antes-atas.'
