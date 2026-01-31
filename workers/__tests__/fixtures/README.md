# Fixtures para testes do FFmpegProcessor

Os testes de `extractFramesFromUrl` precisam de um vídeo em `fake-video.mp4`. Sem esse arquivo, os testes são pulados.

## Gerar o vídeo (3 segundos)

Requisito: [ffmpeg](https://ffmpeg.org/) instalado.

Na raiz do repositório:

```bash
./workers/__tests__/fixtures/generate-fake-video.sh
```

Ou, dentro da pasta de fixtures:

```bash
cd workers/__tests__/fixtures && ./generate-fake-video.sh
```

Isso cria `fake-video.mp4` (~3s). Depois disso, rode os testes de novo: os dois testes de extractFrames deixam de ser pulados.
