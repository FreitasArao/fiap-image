-- CASSANDRA SCHEMA - Query-First Design

CREATE KEYSPACE IF NOT EXISTS fiap_image
WITH replication = {'class': 'SimpleStrategy', 'replication_factor': 1};

USE fiap_image;

-- Tabela principal: vídeo + metadados
CREATE TABLE IF NOT EXISTS video (
  video_id UUID,
  user_id UUID,
  status TEXT,
  total_size BIGINT,
  duration BIGINT,
  parts_count INT,
  integration_name TEXT,
  third_party_video_id TEXT,
  object_key TEXT,
  bucket_name TEXT,
  created_at TIMESTAMP,
  failure_reason TEXT,
  updated_at TIMESTAMP,
  PRIMARY KEY (video_id)
);

-- Listar vídeos por usuário
CREATE TABLE IF NOT EXISTS video_by_user (
  user_id UUID,
  created_at TIMESTAMP,
  video_id UUID,
  status TEXT,
  PRIMARY KEY (user_id, created_at, video_id)
) WITH CLUSTERING ORDER BY (created_at DESC, video_id ASC);

-- Partes do vídeo
-- third_party_video_part_id armazena o identificador do provedor (ex: ETag do S3)
CREATE TABLE IF NOT EXISTS video_parts (
  video_id UUID,
  part_number INT,
  size BIGINT,
  third_party_video_part_id TEXT,
  url TEXT,
  status TEXT,
  uploaded_at TIMESTAMP,
  created_at TIMESTAMP,
  updated_at TIMESTAMP,
  PRIMARY KEY (video_id, part_number)
) WITH CLUSTERING ORDER BY (part_number ASC);

-- Lookup reverso por uploadId
CREATE TABLE IF NOT EXISTS video_by_third_party_id (
  third_party_video_id TEXT,
  integration_name TEXT,
  video_id UUID,
  PRIMARY KEY (third_party_video_id)
);


-- =========================
-- DEV (COMENTADO)
-- =========================

-- TRUNCATE TABLE video;
-- TRUNCATE TABLE video_by_user;
-- TRUNCATE TABLE video_parts;
-- TRUNCATE TABLE video_by_third_party_id;

-- DROP TABLE video;
-- DROP TABLE video_by_user;
-- DROP TABLE video_parts;
-- DROP TABLE video_by_third_party_id;

-- DROP KEYSPACE fiap_image;


curl -X PUT -T ./Screen\ Recording\ 2025-06-03\ at\ 20.23.50.mov -i "http://localhost:4566/fiapx-video-parts/019bd2ab-7ca4-7000-806b-f946bb28e6b5?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Content-Sha256=UNSIGNED-PAYLOAD&X-Amz-Credential=ASIA47CRVPMBWXN5D6FL%2F20260118%2Fus-east-1%2Fs3%2Faws4_request&X-Amz-Date=20260118T195341Z&X-Amz-Expires=3600&X-Amz-Signature=1dcbda149dfc492f8205ad1d78cfafba501f0e55552c414ece6a2e10b20200be&X-Amz-SignedHeaders=host&partNumber=1&uploadId=XTnl2pXhtO7KTl9vPTy7H-TBr81Yon3e9SBttIAmo77pYmJwrrqK-X4GKjX2WPQsYioFlM9r8-bmJEOqURpquDkThBHy0lMOseurDB-6u8j5sXwQjYOPOOY9OaRd5ZjT&x-id=UploadPart"