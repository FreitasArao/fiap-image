# Elysia with Bun runtime

## Getting Started
To get started with this template, simply paste this command into your terminal:
```bash
bun create elysia ./elysia-example
```

## Development
To start the development server run:
```bash
bun run dev
```

Open http://localhost:3000/ with your browser to see the result.

## Testes

### Criação de Vídeo

Exemplo de resposta ao criar um vídeo:

```json
{
  "message": "Video created successfully",
  "videoId": "019bd312-78f9-7001-8125-53df0cf2c8cf",
  "uploadId": "jbNkvDEO_Jt-Kmq6q0LBkNhiQAJWxgzpcOL7I8IV1WIjSY2_tQMvPSyBTE_gyX5K9s7qeipx8PAl1MFvD1m2lGYPxlOj34V6eMIrWtQVcvdJc446c8xoxlMauEwIURWL",
  "urls": [],
  "videoPath": "019bd312-78d9-7000-abe4-422208b52d7b",
  "status": "CREATED"
}
```

### Simulando Evento de CompleteMultipartUpload (S3/EventBridge)

Após completar o upload multipart no S3, o EventBridge chama o webhook da API via API Destination.

#### Fluxo Automático (Produção)

```
S3 CompleteMultipartUpload
       ↓
   EventBridge
       ↓
   API Destination (webhook)
       ↓
   API atualiza DB + emite evento UPLOADED
       ↓
   EventBridge → split-queue → split-worker
```

#### Via cURL (Teste Local)

Para simular o webhook diretamente:

```bash
curl -X POST http://localhost:3002/videos/webhooks/s3/complete-multipart \
  -H "Content-Type: application/json" \
  -d '{
    "bucket": "fiapx-video-parts",
    "key": "<videoPath>/video.mp4"
  }'
```

Exemplo com videoPath real:

```bash
curl -X POST http://localhost:3002/videos/webhooks/s3/complete-multipart \
  -H "Content-Type: application/json" \
  -d '{
    "bucket": "fiapx-video-parts",
    "key": "019bd312-78d9-7000-abe4-422208b52d7b/video.mp4"
  }'
```

> **Nota:** O `videoId` é extraído do primeiro segmento do `key` (antes da `/`). Use o `videoPath` retornado na criação do vídeo.

## Workers (FFmpeg)

O projeto inclui workers para processamento de vídeo com FFmpeg:

- **split-worker**: Divide vídeos em segmentos
- **print-worker**: Extrai frames dos vídeos

### Subindo a Infraestrutura Completa

```bash
# Subir todos os serviços (API + Workers + LocalStack)
docker-compose up -d

# Ver logs dos workers
docker-compose logs -f split-worker print-worker
```

### Testando o Fluxo Completo de Processamento

#### 1. Simular evento de vídeo UPLOADED

```bash
aws --endpoint-url=http://localhost:4566 events put-events \
  --entries '[
    {
      "Source": "fiapx.video",
      "DetailType": "Video Status Changed",
      "Detail": "{\"videoId\":\"test-video-123\",\"videoPath\":\"test-video-123\",\"status\":\"UPLOADED\",\"userEmail\":\"user@test.com\",\"videoName\":\"meu-video.mp4\"}"
    }
  ]'
```

#### 2. Verificar mensagem na split-queue

```bash
aws --endpoint-url=http://localhost:4566 sqs receive-message \
  --queue-url http://localhost:4566/000000000000/split-queue \
  --max-number-of-messages 1
```

#### 3. Verificar mensagem na print-queue (após split)

```bash
aws --endpoint-url=http://localhost:4566 sqs receive-message \
  --queue-url http://localhost:4566/000000000000/print-queue \
  --max-number-of-messages 1
```

#### 4. Verificar arquivos gerados no S3

```bash
# Listar segmentos de vídeo
aws --endpoint-url=http://localhost:4566 s3 ls s3://fiapx-video-frames/test-video-123/segments/ --recursive

# Listar frames extraídos
aws --endpoint-url=http://localhost:4566 s3 ls s3://fiapx-video-frames/test-video-123/frames/ --recursive
```

### Filas SQS Disponíveis

| Fila | Descrição |
|------|-----------|
| `split-queue` | Trigger para split worker (UPLOADED → SPLITTING) |
| `print-queue` | Trigger para print worker (SPLITTING → COMPLETED) |
| `processing-dlq` | Dead letter queue para falhas |

### Templates de Email (SES)

| Template | Trigger | Descrição |
|----------|---------|-----------|
| `VideoQuaseFinalizado` | SPLITTING | Email de progresso |
| `VideoConcluido` | COMPLETED | Email com link de download |
| `VideoFalhou` | FAILED | Email de erro |

### Listar Templates SES

```bash
aws --endpoint-url=http://localhost:4566 ses list-templates
```

### Verificar EventBridge Rules

```bash
aws --endpoint-url=http://localhost:4566 events list-rules
```