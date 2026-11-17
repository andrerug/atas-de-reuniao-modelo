# Atas de Reunião

Lista de presença, gravação da reunião, pauta e pareceres viram a ata do conselho em Word, com o voto de cada parecer na íntegra. Feito pelo professor André Viana para o curso IA para o serviço público.

Código aberto e gratuito. Esta é uma cópia pública: nomes de pessoas, conselho e setores são fictícios, e não há chaves no código.

## Como adaptar ao seu conselho

- Em `src/dados/conselheiros-padrao.ts` está uma composição de exemplo ("Ana Exemplo", "Faculdade A"). Troque pela do seu conselho, ou edite direto na tela Configuração do app.
- Em `src/tipos.ts` ficam o cabeçalho, o nome do conselho e a sigla padrão.
- Os endereços `seu-dominio.exemplo` devem virar o domínio do seu servidor.

## Como rodar

1. Instale o Node.js.
2. Defina `GEMINI_API_KEY` (ou a chave do OpenRouter) como variável de ambiente. Nunca no código.
3. `npm install` e depois `npm run dev`. Para servidor, veja `Dockerfile`, `docker-compose.yml` e `vps/instalar.sh`.
4. A pasta `mcp/` tem um conector para o Claude Desktop usar o app pela conversa.

## Cuidados

Ata de conselho tem nomes e decisões sobre pessoas. Use com base legal, apague o áudio depois de transcrever, siga a LGPD e as normas do seu órgão, e confira a ata antes de assinar.
