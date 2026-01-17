// CASSANDRA TABLE TYPES - Query-First Design
// Gerado a partir de docker-compose/init-schema.cql

// Status types
export type VideoStatus =
  | 'pending'
  | 'uploading'
  | 'processing'
  | 'completed'
  | 'failed'

export type PartStatus = 'pending' | 'uploaded' | 'failed'

// Tabela: video
// Query: SELECT * FROM video WHERE video_id = ?
export type VideoTable = {
  video_id: string
  user_id: string
  status: VideoStatus
  total_size: number
  duration: number
  parts_count: number
  integration_name: string
  third_party_video_id: string
  object_key: string
  bucket_name: string
  created_at: Date
  updated_at: Date
}

// Tabela: video_by_user (materialização)
// Query: SELECT * FROM video_by_user WHERE user_id = ?
export type VideoByUserTable = {
  user_id: string
  created_at: Date
  video_id: string
  status: VideoStatus
}

// Tabela: video_parts
// Query: SELECT * FROM video_parts WHERE video_id = ?
export type VideoPartsTable = {
  video_id: string
  part_number: number
  size: number
  third_party_video_part_id: string
  url: string
  status: PartStatus
  created_at: Date
  updated_at: Date
}

// Tabela: video_by_third_party_id (lookup reverso)
// Query: SELECT * FROM video_by_third_party_id WHERE third_party_video_id = ?
export type VideoByThirdPartyIdTable = {
  third_party_video_id: string
  integration_name: string
  video_id: string
}
