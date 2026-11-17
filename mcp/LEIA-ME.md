# Conector MCP do app Atas de Reunião

Deixa o Claude (Desktop e Code) usar o app atas.seu-dominio.exemplo direto da conversa.

## Instalar

1. Em https://atas.seu-dominio.exemplo, abra **Configuração** e clique em **Gerar chave** (seção "Chave para o Claude"). Copie a chave.
2. Nesta pasta, rode `npm run build:mcp` uma vez (gera `mcp/dist/atas-mcp.mjs`).
3. Dê dois cliques em `mcp/instalar-mcp.cmd` e cole a chave.
4. Feche e abra o Claude.

O instalador copia o conector para `%LOCALAPPDATA%\atas-mcp` e registra o servidor "atas" em
`%APPDATA%\Claude\claude_desktop_config.json` e em `~\.claude.json`, guardando cópia `.antes-atas` de cada um.

## O que o Claude consegue fazer

listar_atas, abrir_ata, nova_ata, dados_reuniao, marcar_presenca, enviar_pauta, enviar_parecer,
enviar_gravacao, ler_transcricao, redigir, marcar_resultado, escrever, incluir_item, baixar_word,
salvar_pronta, ver_configuracao.

Exemplo: "Cria a ata da 10ª reunião, a Irene Exemplo faltou por viagem, a pauta está em Downloads\pauta.pdf,
os pareceres na pasta Downloads\pareceres e a gravação em Downloads\reuniao.m4a. Depois baixa o Word."

## Segurança

A chave dá acesso às suas atas. Para cortar o acesso, apague ou gere outra em Configuração.
O Word é gerado no seu computador; a gravação, a pauta e os pareceres vão para o app como pela tela.
