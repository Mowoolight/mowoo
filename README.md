> **원본 프로젝트**: [kwaroran/RisuAI](https://github.com/kwaroran/RisuAI) — 이 프로젝트는 RisuAI를 기반으로 한 커뮤니티 개조 버전입니다.

---

# RisuAI NodeOnly

**RisuAI의 기능은 그대로, Node.js 서버 하나로 가볍게.**

RisuAI NodeOnly는 원본 [RisuAI](https://github.com/kwaroran/RisuAI)에서 Tauri/Capacitor/웹 배포를 위한 복잡도를 제거하고, **Node.js 단독 실행**에 최적화한 로컬 서버 버전입니다.

PC에서 실행하면 브라우저로 접속하고, 설정 하나면 스마트폰에서도 사용할 수 있습니다.

---

## 이런 분들에게 추천합니다

- **로컬에서 가볍게** AI 채팅을 즐기고 싶은 분
- 서버에 설치해서 **여러 기기에서 접속**하고 싶은 분
- SillyTavern처럼 **직접 관리하는 로컬 환경**을 원하는 분
- 원본 RisuAI의 기능은 좋지만 **Tauri 앱 설치 없이** 쓰고 싶은 분

---

## 주요 특징

### 원본 RisuAI의 모든 기능

원본 RisuAI가 제공하는 핵심 기능을 모두 사용할 수 있습니다.

- **다양한 AI 모델 지원** — OpenAI, Claude, Gemini, DeepInfra, OpenRouter 등
- **감정 이미지** — 캐릭터의 표정에 따라 이미지가 바뀜
- **그룹 채팅** — 여러 캐릭터와 동시 대화
- **플러그인** — 커스텀 기능과 프로바이더 추가
- **정규식 스크립트** — 모델 출력을 자유롭게 가공
- **로어북** — 캐릭터의 세계관과 기억을 확장
- **테마** — Classic, WaifuLike, WaifuCut
- **TTS** — 텍스트를 음성으로 변환
- **인레이 에셋** — 이미지, 오디오, 비디오를 채팅에 삽입
- **장기 기억** — HypaMemory V2/V3, SupaMemory

### NodeOnly에서 추가/개선된 기능

| 기능 | 설명 |
|------|------|
| **SQLite 기반 저장소** | 모든 데이터(캐릭터, 채팅, 설정, 에셋)를 단일 SQLite DB에 저장합니다. 파일 기반 저장 대비 빠르고 안정적입니다. |
| **서버 주도 백업** | `.risusave` 형식의 로컬 백업을 서버에서 직접 내보내기/가져오기 합니다. 브라우저 메모리 한계 없이 대용량 백업도 처리 가능합니다. |
| **에셋 직접 서빙** | 이미지/오디오/비디오를 세션 쿠키 인증 + ETag 캐시로 직접 서빙합니다. API 호출 없이 `<img src>` 한 줄로 로드됩니다. |
| **인레이 갤러리** | 저장된 인레이 에셋을 한눈에 관리할 수 있는 갤러리 UI입니다. 고아 파일 탐지, lazy loading을 지원합니다. |
| **채팅별 프롬프트 토글** | 프롬프트 옵션(토글)을 채팅별로 독립 저장/복원합니다. 채팅을 전환해도 각 채팅의 설정이 유지됩니다. |
| **프리셋별 토글 값** | 프리셋마다 토글 값을 독립 저장합니다. 프리셋을 바꿔도 이전 프리셋의 설정이 보존됩니다. |
| **채팅 프리셋 바인딩** | 특정 채팅에 프리셋을 고정할 수 있습니다. 해당 채팅에 진입하면 바인딩된 프리셋이 자동 적용됩니다. |
| **GZIP 압축** | HTTP 응답을 자동 압축하여 네트워크 사용량을 줄입니다. |
| **업데이트 알림** | 새 버전이 나오면 홈 화면과 팝업으로 알려줍니다. |

---

## 설치 방법

난이도가 쉬운 순서대로 정렬했습니다. 자신에게 맞는 방법을 선택하세요.

---

### 1. Docker (가장 쉬움)

> Docker만 설치되어 있으면 **한 줄**로 끝납니다.

#### Docker가 뭔가요?

Docker는 프로그램을 "컨테이너"라는 독립된 공간에서 실행해주는 도구입니다. Node.js 같은 것을 직접 설치할 필요 없이, 모든 것이 컨테이너 안에 포함되어 있습니다.

#### 설치 순서

**1단계: Docker 설치**

- **Windows/Mac**: [Docker Desktop](https://www.docker.com/products/docker-desktop/) 다운로드 후 설치
- **Linux**: 터미널에서 실행
  ```bash
  curl -fsSL https://get.docker.com | sh
  ```

**2단계: RisuAI 실행**

터미널(Windows: PowerShell, Mac/Linux: Terminal)을 열고 아래 명령어를 붙여넣으세요:

```bash
curl -L https://raw.githubusercontent.com/mrbart3885/Risuai-NodeOnly/main/docker-compose.yml | docker compose -f - up -d
```

**3단계: 접속**

브라우저를 열고 주소창에 입력:
```
http://localhost:6001
```

#### 업데이트 방법

```bash
docker compose pull && docker compose up -d
```

#### 데이터 위치

채팅, 캐릭터 등 모든 데이터는 Docker 볼륨(`risuai-save`)에 안전하게 저장됩니다.
업데이트해도 데이터는 그대로 유지됩니다.

---

### 2. 포터블 패키지 (설치 불필요)

> 압축 파일을 풀고 **더블클릭**하면 바로 실행됩니다. Node.js 설치도 필요 없습니다.

#### 설치 순서

**1단계: 다운로드**

[Releases 페이지](https://github.com/mrbart3885/Risuai-NodeOnly/releases)에서 자신의 운영체제에 맞는 파일을 다운로드하세요:

| 운영체제 | 파일명 |
|----------|--------|
| Windows | `RisuAI-NodeOnly-vX.X.X-win-x64.zip` |
| macOS (Apple Silicon) | `RisuAI-NodeOnly-vX.X.X-macos-arm64.tar.gz` |
| Linux | `RisuAI-NodeOnly-vX.X.X-linux-x64.tar.gz` |

**2단계: 압축 해제**

다운로드한 파일의 압축을 원하는 위치에 풀어주세요.

**3단계: 실행**

- **Windows**: `RisuAI.bat` 더블클릭
- **Mac/Linux**: 터미널에서 `./start.sh` 실행

브라우저가 자동으로 열리며, `http://localhost:6001`로 접속됩니다.

#### 업데이트 방법

- **Windows**: `update.bat` 더블클릭
- **Mac/Linux**: `./update.sh` 실행 (포터블 디렉토리 안의 update.sh)

자동으로 최신 버전을 다운로드하고 파일을 교체합니다.
채팅, 캐릭터 등의 데이터(`save/` 폴더)는 그대로 보존됩니다.

---

### 3. 설치 스크립트 (Linux/macOS 서버용)

> 서버에 상시 구동하고 싶을 때 사용합니다. Node.js가 필요합니다.

#### 사전 준비

Node.js 20 이상이 설치되어 있어야 합니다.

```bash
# Node.js 버전 확인
node --version
# v20.0.0 이상이면 OK
```

Node.js가 없다면: [Node.js 공식 사이트](https://nodejs.org/)에서 설치하세요.

#### 설치 순서

터미널에서 아래 명령어 한 줄을 실행하세요:

```bash
curl -fsSL https://raw.githubusercontent.com/mrbart3885/Risuai-NodeOnly/main/install.sh | bash
```

설치가 완료되면 안내 메시지가 표시됩니다.

#### 서버 시작

```bash
cd ~/risuai-nodeonly
pnpm runserver
```

브라우저에서 `http://localhost:6001`로 접속합니다.

#### 업데이트 방법

```bash
cd ~/risuai-nodeonly
./update.sh
```

---

### 4. Git Clone (개발자/고급 사용자)

> 소스 코드를 직접 관리하고 싶은 분을 위한 방법입니다.

```bash
git clone https://github.com/mrbart3885/Risuai-NodeOnly.git
cd Risuai-NodeOnly
pnpm install
pnpm build
pnpm runserver
```

브라우저에서 `http://localhost:6001`로 접속합니다.

#### 업데이트 방법

```bash
git pull
pnpm install
pnpm build
# 서버 재시작
pnpm runserver
```

---

## 모바일에서 접속하기 (Tailscale)

PC에서 실행 중인 RisuAI에 스마트폰으로 접속하고 싶다면 **Tailscale**을 추천합니다.

### Tailscale이 뭔가요?

Tailscale은 내 기기들끼리 안전한 사설 네트워크를 만들어주는 앱입니다.
같은 계정으로 로그인한 기기끼리만 접속할 수 있어서, 채팅 데이터가 외부로 노출될 걱정이 없습니다.

### 설정 순서

**1단계: Tailscale 설치**

- PC: [tailscale.com](https://tailscale.com/) 에서 다운로드
- 스마트폰: App Store 또는 Google Play에서 "Tailscale" 검색 후 설치

**2단계: 같은 계정으로 로그인**

PC와 스마트폰 모두 동일한 계정(Google, Microsoft 등)으로 로그인합니다.

**3단계: PC에서 HTTPS 공유 설정**

PC 터미널에서 아래 명령어를 한 번만 실행하면 됩니다:

```bash
tailscale serve --bg https / http://localhost:6001
```

**4단계: 스마트폰에서 접속**

스마트폰 브라우저에서 아래 형태의 주소로 접속합니다:
```
https://내PC이름.tail어쩌구.ts.net
```

정확한 주소는 Tailscale 앱의 기기 목록에서 PC 이름을 확인하세요.

> 한 번 설정하면 이후에는 PC에서 서버만 실행하면 스마트폰에서 바로 접속할 수 있습니다.
> URL이 항상 같으므로 브라우저 즐겨찾기에 추가해두면 편리합니다.

---

## 원본 RisuAI와의 차이점

| 항목 | 원본 RisuAI | NodeOnly |
|------|-------------|----------|
| 실행 방식 | Tauri 앱 / 웹 / Capacitor | Node.js 서버 전용 |
| 데이터 저장 | 파일 시스템 + localStorage | SQLite 단일 DB |
| 백업 | Google Drive + 로컬 | 서버 주도 로컬 백업 |
| 에셋 로딩 | API 호출 | 직접 URL 서빙 + 캐시 |
| 배포 대상 | 웹, 데스크톱, 모바일 앱 | 로컬 서버 (브라우저 접속) |
| 코드 복잡도 | 멀티 플랫폼 분기 | 단일 경로 |

---

## 라이선스

이 프로젝트는 원본 RisuAI와 동일한 [GPL-3.0](LICENSE) 라이선스를 따릅니다.
