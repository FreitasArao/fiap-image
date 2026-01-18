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

Após completar o upload multipart no S3, o EventBridge envia um evento para a fila SQS. Para simular esse evento localmente:

#### Formato do Evento S3

```json
{
  "detail": {
    "bucket": { "name": "fiapx-video-parts" },
    "object": { "key": "<videoPath>/video.mp4" },
    "reason": "CompleteMultipartUpload"
  }
}
```

> **Nota:** O `videoId` é extraído do primeiro segmento do `key` (antes da `/`). Use o `videoPath` retornado na criação do vídeo.

#### Via AWS CLI

```bash
aws --endpoint-url=http://localhost:4566 sqs send-message \
  --queue-url http://localhost:4566/000000000000/multipart-complete-queue \
  --message-body '{
    "detail": {
      "bucket": { "name": "fiapx-video-parts" },
      "object": { "key": "019bd312-78d9-7000-abe4-422208b52d7b/video.mp4" },
      "reason": "CompleteMultipartUpload"
    }
  }'
```

#### Via cURL

```bash
curl -X POST "http://localhost:4566/000000000000/multipart-complete-queue" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "Action=SendMessage&MessageBody=%7B%22detail%22%3A%7B%22bucket%22%3A%7B%22name%22%3A%22fiapx-video-parts%22%7D%2C%22object%22%3A%7B%22key%22%3A%22019bd312-78d9-7000-abe4-422208b52d7b%2Fvideo.mp4%22%7D%2C%22reason%22%3A%22CompleteMultipartUpload%22%7D%7D"
```

### Verificando Mensagens na Fila

Para verificar se há mensagens na fila SQS:

```bash
aws --endpoint-url=http://localhost:4566 sqs receive-message \
  --queue-url http://localhost:4566/000000000000/multipart-complete-queue \
  --max-number-of-messages 10
```