# Status Platform — Golden Master Architecture (Phases 1–24)

Production handover reference for the complete Status monorepo.

## Unified system topology

```mermaid
flowchart TB
  subgraph clients [Flutter Clients]
    Mobile[Mobile iOS/Android]
    Desktop[Desktop Linux/macOS]
    Web[Web PWA]
  end

  subgraph edge [Global Edge]
    CDN[CloudFront / Cloudflare CDN]
    CFGeo[Geo Headers CF-IPCountry]
  end

  subgraph api [Status API Node.js]
    Express[Express REST /api/v1]
    Socket[Socket.IO Realtime]
    SelfHeal[Self-Healing Daemon]
    SynthSim[Synthetic Simulator]
  end

  subgraph ai [AI Layer]
    Router[Multi-LLM Router]
    vLLM[vLLM Self-Hosted]
    MultiAgent[Multi-Agent Coordinator]
    Gov[AI Governance Logging]
    Anomaly[Anomaly Detection]
  end

  subgraph data [Data Layer]
    PG[(PostgreSQL + pgvector)]
    ReadRep[(Read Replicas Geo)]
    Redis[(Redis Cache)]
    Kafka[Redpanda/Kafka Events]
  end

  subgraph security [Security]
    PQ[Post-Quantum JWT + Kyber E2EE]
    ZKP[ZKP Reputation Proofs]
    IPFS[IPFS Decentralized Storage]
  end

  subgraph phase24 [Phase 24]
    Affective[Affective Biometrics]
    Mesh[P2P Mesh Gossip]
    Metaverse[VRM / OpenXR Export]
  end

  clients --> CDN
  CDN --> Express
  clients --> Socket
  clients -. offline .-> Mesh
  Express --> Router
  Router --> vLLM
  Router --> MultiAgent
  Express --> PG
  Express --> ReadRep
  CFGeo --> ReadRep
  Express --> Redis
  Express --> Kafka
  Express --> Gov
  Express --> Anomaly
  Express --> SelfHeal
  Express --> Affective
  Express --> Metaverse
  Mesh --> Express
  clients --> PQ
```

## Phase evolution map

```mermaid
timeline
  title Status Platform — 24 Phase Evolution
  section Foundation 1-5
    Auth & Characters : PostgreSQL schema
    Feed & DMs : Socket.IO realtime
  section AI 6-12
    Multi-LLM Router : OpenAI Anthropic Gemini
    Agent Workflows : Tools & memory
    vLLM Self-Hosted : Fine-tuning export
  section Immersive 13-18
    3D Avatars GLB : LiveKit Simli
    Spatial Computing : Proxemic UI
    Wearable HUD : BLE companion
  section Advanced 19-22
    E2EE DMs Kyber : Federated learning
    Public OAuth API : AI Governance EU AI Act
    PQ Auth CDN Edge : Anomaly alerting
  section Frontier 23-24
    Self-Healing : Synthetic personas
    Spatial Audio BCI : Affective biometrics
    P2P Mesh : VRM OpenXR metaverse
    Golden Master : Production handover
```

## Phase 24 component diagram

```mermaid
flowchart LR
  subgraph flutter [Flutter Client]
    Cam[Camera/Wearable Sensors]
    AffSvc[AffectiveBiometricsService]
    AffBridge[AffectiveContextBridge]
    LocalAI[LocalAiService]
    MeshSvc[MeshNetworkService]
    WebRTC[MeshWebRtcChannel]
    Gossip[MeshGossipProtocol]
  end

  subgraph backend [Node.js Backend]
    AffAPI["POST /affective/metrics"]
    MeshAPI["POST /mesh/gossip"]
    MetaAPI["POST /metaverse/sync"]
    MetaWS[metaverse_voice_stream]
    Prompts[AI Prompts + affectiveBlock]
  end

  subgraph engines [External Engines]
    UE5[Unreal Engine 5]
    Unity[Unity]
    OpenXR[OpenXR Runtimes]
  end

  Cam --> AffSvc
  AffSvc --> AffBridge
  AffBridge --> LocalAI
  AffSvc --> AffAPI
  AffAPI --> Prompts
  MeshSvc --> Gossip
  MeshSvc --> WebRTC
  MeshSvc --> MeshAPI
  MetaAPI --> UE5
  MetaAPI --> Unity
  MetaWS --> OpenXR
```

## Deployment sequence

```mermaid
sequenceDiagram
  participant GM as deploy_golden_master.sh
  participant Audit as golden_master_audit.sh
  participant DB as PostgreSQL
  participant CDN as CloudFront
  participant API as Status API

  GM->>Audit: Security & memory audit
  Audit-->>GM: PASS
  GM->>DB: Migrations 001-018
  GM->>CDN: terraform apply
  GM->>API: npm test + start
  API-->>GM: /metrics /api/docs ready
```

## Key endpoints (Phase 24)

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/v1/affective/metrics` | POST | Submit processed HRV/facial/voice stress |
| `/api/v1/affective/context` | GET | Latest affective AI context block |
| `/api/v1/mesh/register` | POST | Register P2P mesh peer |
| `/api/v1/mesh/gossip` | POST | Gossip sync threads/embeddings/memory |
| `/api/v1/mesh/signal` | POST | WebRTC signaling relay |
| `/api/v1/metaverse/sync` | POST | Create VRM/OpenXR sync session |
| `/api/v1/metaverse/export/:id` | GET | Export character manifest |
| `/api/v1/metaverse/sync/:token` | GET | Retrieve sync manifest |

## WebSocket events (metaverse)

| Event | Direction | Payload |
|-------|-----------|---------|
| `join_metaverse_sync` | Client → Server | syncToken |
| `metaverse_voice_chunk` | Client → Server | chunk, format |
| `metaverse_voice_stream` | Server → Clients | PCM/audio chunk |
| `metaverse_personality_sync` | Bidirectional | personality patch |

## Environment flags

```env
# Phase 24
AFFECTIVE_BIOMETRICS=true
MESH_NETWORK_ENABLED=true
MESH_CLUSTER_ID=status-local
```

## Audit & release

```bash
chmod +x deploy/deploy_golden_master.sh scripts/golden_master_audit.sh
./scripts/golden_master_audit.sh
DRY_RUN=true ./deploy/deploy_golden_master.sh
./deploy/deploy_golden_master.sh
```

## Migration index

| Migration | Phase | Description |
|-----------|-------|-------------|
| 005–010 | 1–12 | Core schema, auth, AI |
| 011 | 14 | Spatial computing |
| 013 | 19 | E2EE, fine-tuning |
| 014 | 20 | Wearable, IPFS, ZKP |
| 015 | 21 | Federated learning, public API |
| 016 | 22 | AI governance, PQ crypto |
| 017 | 23 | Self-healing, synthetic sim, BCI |
| 018 | 24 | Affective biometrics, mesh, metaverse |
