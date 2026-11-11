# 팡팡 골프 개발 안내

팡야풍 캐주얼 3D 골프 게임. 순수 HTML/CSS/JS + three.js r147(클래식 빌드, `js/lib`에 포함), 빌드 도구 없음.
`index.html`을 바로 열어 실행한다(`file://` 지원 필수, 모듈·fetch 금지, 그림과 GLB는 data URI). r148 이후에는 클래식 GLTFLoader가 없으니 올리지 말 것..

## 작업 원칙
1. 작업 전에 계획을 짧게 보여 주고 바로 진행한다. 기능 하나 = 커밋 하나, 커밋 메시지는 한국어.
2. 물리·밸런스 수치는 파일 상단 상수(`PHYS`, `HAZARD`, `TERRAIN`, `TERRAIN_LIE`, `CLUB_TYPES`, `SPECIAL_SHOTS`, `GAME`)에서만 고친다.
3. `render.js`·`models.js`는 게임 상태를 바꾸지 않는다(그림 캐시 제외). 상태 변경은 `game.js`·`ui.js`만.
4. 외부 에셋은 CC0만(코드 라이브러리 three.js는 MIT), `CREDITS.md`에 출처를 적는다. 기존 IP의 캐릭터·로고·이름은 쓰지 않는다(완벽 임팩트의 게임 내 이름은 "팡!").
5. 폭 380px 세로 화면과 PC 둘 다 깨지지 않아야 한다.

## 구조

| 파일 | 역할 |
|---|---|
| `index.html`, `css/style.css` | DOM 뼈대(HUD, 조작판, 타이틀, 창)와 스타일 |
| `js/assets.js` | 내장 그림(자동 생성, `tools/bake_assets.py`) |
| `js/characters.js` | 내장 캐릭터 GLB 두 개(남·여, 자동 생성, `tools/bake_characters.js`) |
| `js/data.js` | `CLUB_TYPES`, `SPECIAL_SHOTS`, `ITEMS`(장비 5슬롯, 캐릭터 `passive`), `THEMES`, `HOLES` |
| `js/lib/` | three.js r147, GLTFLoader, 라이선스 |
| `js/physics.js` | 3D 물리(x 앞, y 위, z 오른쪽). `PHYS`, `HAZARD`, `TERRAIN`, `COURSE`, 높이·지형 표, `rollHoleLayout`, `launchFrom`, `stepBall`, `simulateShot`(Node에서도 실행) |
| `js/audio.js` | `SFX`: WebAudio 합성음. `compose`는 오프라인 렌더로도 검사 가능 |
| `js/models.js` | 3D 캐릭터: VRoid 애니 모델 두 몸(`useBody`), 툰 음영(`TOON`), 재질 이름으로 부위별 색 입히기(`CHAR_LOOK`), 뼈대 IK 스윙 `poseGolfer`, 홀인 기쁨 `poseCheer`, 모자·클럽 메시, 상점 아이콘 촬영 `renderIcons` |
| `js/render.js` | three.js 장면: 코스 그림 `paintCourse`, 지형·물·나무·돌, 공·궤적·입자, 미니맵 |
| `js/game.js` | `GAME` 상수, 상태 `G`, 샷 진행, 입자, 카메라. 공개 함수 `pressShot`, `placeBall(x, z)`, `readyNextShot`, `setYaw` |
| `js/ui.js` | 입력, HUD 동기화, 상점·결과 창, 게임 루프, `?test` 음소거, `?test&manual`은 `__step(초)`로 직접 진행 |
| `tests/` | `distance.js`(비거리), `hazards.js`(코스 변수), `playthrough.js`(전 기능), `tour.js`(6홀 완주·380px 넘침) |
| `tools/bake_assets.py` | CC0 원본(하늘·나무·질감·입자) → `assets.js` |
| `tools/bake_characters.js` | VRoid CC0 VRM → `characters.js` (`vrm_slim.js`로 모프·확장 제거, `vrm_tex.py`로 그림 축소·회색화, 공용에셋 gltf-pack + icarus glbslim) |

샷 단계: `aim → power → impact → swing → ball → stopped/holed → score`. 파워 게이지가 0으로 내려오거나 임팩트를 놓치면 `cancelShot`으로 타수 없이 `aim`에 돌아간다.

## 조작
- 모바일: 화면을 톡 치거나 게이지·샷 버튼을 눌러 시작 → 파워 → 임팩트. 조준 중 화면을 좌우로 끌면 방향.
- 웹: 스페이스로 시작 → 파워 → 임팩트, ←→ 방향, WASD 타점, 1~4 클럽, G 그린 보기.
- 게이지(`GAME.gaugeSpeed` 0.5): 끝까지 오르는 데 2초, 꼭대기에서 `gaugeTopHold` 0.35초 머문다. 화살표 커맨드는 임팩트 단계에서도 받는다.
- 퍼팅: 시작 → 세기 한 번으로 바로 친다(임팩트 판정 없음, `puttGaugeSpeed`). 게이지 글자는 평지 기준 굴러갈 거리(m).
- 그린 보기(`toggleGreenView`): 조준 중 왼쪽 위 버튼·미니맵·G 키. 샷을 시작하면 공으로 돌아온다.
- 타점 공(`setImpactPoint`): 아래를 칠수록 백스핀·높은 탄도, 위는 톱스핀·낮은 탄도, 좌우는 휘는 방향(`curve` × 클럽 `curveCtl`).
- 특수샷 커맨드: 파워 게이지가 오르는 동안 화면에 그리거나(`recognizeGesture`) 화살표를 누른다. 임팩트가 판정 폭 안이어야 나가고, 빗나가면 '커맨드 실패'로 일반 샷이 된다. 커맨드 없이 판정 폭 안이면 팡!(속도 ×1.065).

| 특수샷 | 화면 | 키보드 | 효과 |
|---|---|---|---|
| 토마호크 | 위로 긋기 | ↑↑ | 고탄도, 착지 후 거의 안 구름 |
| 스파이크 | 아래로 긋기 | ↓↓ | 저탄도, 강한 런 |
| 회오리 | 원 그리기(시계 방향이면 오른쪽) | ←↑→ / →↑← | 크게 휨 |
| 도트 | 점 세 번 찍기 | ↑↓↑ | 착지 뒤 백스핀으로 끌려옴 |

## 스탯 공식 (기준값 10, `PHYS` 상단)

| 스탯 | 공식 |
|---|---|
| 파워 | 속도 = `v0 × 게이지^0.5 × (1 + (파워-10) × 0.0065)` |
| 컨트롤 | 빗나감 ÷ `(1 + (컨트롤-10) × 0.035)` |
| 임팩트 | 완벽 판정 절반 폭 = `0.022 + (임팩트-10) × 0.0016` (게이지 비율) |
| 스핀 | 스핀 입력 효과 × `(1 + (스핀-10) × 0.03)` |

- 스탯 = 캐릭터 스탯 + 클럽·모자·상의·신발 보너스.
- 완벽(팡!): 속도 ×1.065(특수샷이 나가면 ×1.03), 오차 0. 그 외 `빗나감 = (|오차| - 판정 폭) ÷ 컨트롤 배율`로 속도·각도·스핀이 나빠지고 공이 휜다(늦으면 슬라이스, 빠르면 훅).
- 공 위치: 러프 ×0.88, 벙커 ×0.5(웨지는 ×0.86).
- 패시브: 레오 바람 -10%, 미나 퍼팅 게이지 20% 느림, 카이 드라이버 +5%, 소라 백스핀 +30%, 좀비 버디 팡 코인 2배, G-BOT 마커에 바람 반영.

## 코스 변수 (`HAZARD`, 홀 시작마다 `rollHoleLayout`이 새로 정함)
- 잔요철: 페어웨이·러프의 높이가 조금씩 달라진다. 그린과 그 둘레는 그대로다.
- 튀는 방향: 지형별 `kick` 폭만큼 착지 때 지면 기울기가 흔들린다(러프가 가장 크다).
- 지면 구역: 단단한 땅(`hard`, 잘 구름), 질퍽한 땅(`soft`, 잘 멈춤·샷 속도 ×0.94).
- 돌: 낮은 공이 맞으면 55%는 앞으로, 45%는 뒤로 튄다.
- 나무: 잎에 들어가면 22%는 통과, 나머지는 속도가 꺾이고 흩어진다. 줄기(반지름 0.38m)에 맞으면 되튄다. 코스 양옆 숲 + 페어웨이 가장자리 나무가 있고 그린 둘레 16m는 비워 둔다.
- 최대비거리 마커는 장애물을 무시한다(`ignoreHazards`). 공의 임의값은 `b.seed`로, `simulateShot`은 시드가 같으면 결과가 같다.

## 기준 비거리 (기본 스탯, 무풍, 평지)
보통 정타(판정 폭 바로 밖) 캐리: 1W 200.0m(허용 195~230), 5I 152.5m, SW 78.6m. 팡!: 1W 218m, 5I 167m, SW 86m.
1W 특수샷: 토마호크 캐리 214m·런 1m, 스파이크 168m·런 70m, 회오리 230m·좌우 45m, 도트 214m·런 16m(SW는 4m 끌려옴).

## 검증 (작업마다)
```bash
for f in js/*.js; do node --check "$f"; done
node tests/distance.js
node tests/hazards.js
NODE_PATH=<playwright-core의 node_modules> node tests/playthrough.js <스크린샷 폴더>
NODE_PATH=<playwright-core의 node_modules> node tests/tour.js <스크린샷 폴더>
```
`playthrough.js`는 설치된 Edge의 SwiftShader WebGL을 쓴다(폭 400·1200). 스크린샷은 직접 열어 확인한다. 저장소에 의존성을 추가하지 않도록 playwright-core는 저장소 밖에 설치한다.

## 다음 작업 후보
- 실제 휴대폰에서 터치 게이지 속도와 소리 균형 조정
- 코스 확장(9·18홀), 비·저녁 같은 날씨, 비행 중 돌풍
- 온라인 점수판과 일일 도전(공용에셋의 Supabase 점수판 재사용)
- 스윙 중 팔·몸 회전 다듬기, 캐릭터별 승리 포즈
- 나무를 3D 모델로 교체, 공이 멈춘 곳까지 걸어가는 연출
- 캐릭터: 표정(모프를 하나만 남겨 웃는 얼굴), 머리카락 흔들림, characters.js(약 4MB) 더 줄이기(면 수 축소)
