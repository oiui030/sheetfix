# SheetFix

CSV와 XLSX를 한 결과로 합치고, 열 이름을 맞춘 뒤 날짜·통화·중복을 정리합니다. 검토가 필요한 값은 원문 그대로 남기고, 승인한 결과만 XLSX로 내보냅니다. 화면 문구는 한국어입니다. 파일 내용은 브라우저 안에서만 처리합니다.

## 바로 실행

Node.js 22.13 이상이 필요합니다.

```bash
npm ci
npm test
npm run build:static
npm run preview:static
```

브라우저에서 http://127.0.0.1:4173 을 엽니다. **예시 파일로 바로 정리**를 누르면 샘플 CSV와 XLSX가 합쳐지고, 정리 전후 요약이 바로 나타납니다.

정적 결과물은 `dist-static/`입니다. 이 폴더만 올리면 됩니다. 데이터베이스나 로그인 없이 동작합니다.

```bash
npx --yes serve dist-static
```

`dist-static/`을 정적 호스트에 올리면 됩니다. 자산 경로는 상대 경로라 하위 경로에서도 동작합니다. 오래 유지할 주소는 아래 Durable static hosting을 사용합니다. 임시 터널은 보장되지 않습니다.

## 예시 파일

- `public/samples/고객_2026년11월.csv` — 한글 헤더, `2026.11.02`, `2026년 11월 3일`, `1,200,000원`, 중복 행, 애매한 날짜, 잘못된 값
- `public/samples/주문_추가.xlsx` — 두 번째 파일. 엑셀 날짜 일련번호, `1,500,000원`, 빈 시트는 건너뜀
- `public/samples/거래처_cp949.csv` — 한글 Windows 엑셀에서 자주 저장하는 EUC-KR/CP949 CSV

앱 왼쪽의 **예시 CSV 받기**, **예시 XLSX 받기**로 같은 파일을 내려받아 다시 올릴 수 있습니다.

## 테스트와 타입 검사

```bash
npm test
npm run typecheck
```

`npm test`는 `engine.test.ts`를 실행합니다. 샘플 파일을 실제로 읽어 열 연결, 중복 제거, 날짜·통화 변환, XLSX 내보내기까지 확인합니다.

## 개발 서버 (Cloudflare / Sites)

`npm run dev`는 Vinext와 Cloudflare Workers 로컬 런타임으로 전체 앱을 띄웁니다. 기본 주소는 http://127.0.0.1:5173 입니다. 클라우드에 작업을 저장하려면 D1(`DB`)와 R2(`BUCKET`) 바인딩이 필요하고, 로그인 헤더는 Sites가 넣어 줍니다. 정적 미리보기에는 이 저장 기능이 없습니다.

```bash
npm run dev
npm run build
npm start
```

스키마를 바꾼 뒤에는 `npm run db:generate`로 SQL을 만들고, 로컬 D1에 적용한 다음 저장을 시험합니다.

## Durable static hosting

임시 터널 대신 이 정적 앱을 계속 열려 있게 하려면 `dist-static/`을 게시합니다. 로그인도 데이터베이스도 필요 없습니다.

### Cloudflare Pages

저장소를 연결하고 프레임워크 프리셋은 None으로 둡니다.

| 설정 | 값 |
| --- | --- |
| Build command | `npm ci && npm run build:static` |
| Build output directory | `dist-static` |
| Root directory | `/` |
| Environment variable `NODE_VERSION` | `22` |

`package.json`의 `engines`는 Node.js 22.13 이상입니다. Pages가 그 버전을 쓰도록 환경 변수 `NODE_VERSION`을 `22`로 넣습니다. 저장소의 `.node-version`도 `22`입니다. 설치 명령과 빌드 명령이 나뉘어 있으면 설치는 `npm ci`, 빌드만 `npm run build:static`으로 둡니다.

프로덕션 브랜치에 푸시하면 Pages가 다시 배포합니다. Pull request에는 미리보기 주소가 생깁니다.

### GitHub Pages (optional)

`.github/workflows/pages.yml`은 같은 정적 빌드를 GitHub Pages에 올립니다. 자동으로 돌지 않고, Actions에서 **Deploy GitHub Pages**를 직접 실행할 때만 배포합니다. 저장소 Settings → Pages → Source를 **GitHub Actions**로 바꾼 뒤 워크플로를 실행합니다.

게시 주소는 `https://<user>.github.io/<repo>/` 형태입니다. 빌드의 `base`가 `./`라 저장소 하위 경로에서도 스크립트를 찾습니다.

Sites용 `npm run build`와 이 정적 배포는 별개입니다. Sites 자동 배포는 연결되어 있지 않습니다.

## 배포

정적 시험 배포는 `npm run build:static` 결과만 올리면 됩니다.

Sites 배포는 `.openai/hosting.json`의 `project_id`와 DB / BUCKET 바인딩을 유지합니다. Sites의 build-site, site-workflow로 빌드한 뒤 save_site_version, deploy_site_version으로 게시합니다. 자격 증명은 커밋하지 않습니다. 방문자 헤더를 위조할 수 있는 프록시 뒤에 두지 않습니다.

GitHub: https://github.com/oiui030/sheetfix  
운영 주소: https://sheetfix-editor.starrydune3.chatgpt.site

Sites가 관리하는 Git이 운영 배포 소스입니다. Sites용 GitHub Actions 자동 배포는 설정되어 있지 않습니다. 정적 GitHub Pages 워크플로는 수동 실행입니다.

## 데이터

원본 바이너리는 올리지 않습니다. 로그인한 사용자가 저장을 누를 때만 표 데이터와 설정이 비공개 R2에 들어가고, 소유자·제목·시각은 D1에 남습니다. 사용자당 작업 40개, 저장당 8MB입니다. 삭제하면 객체와 레코드를 함께 지웁니다. 자동 만료나 공동 편집은 없습니다.

## 처리 범위

한 번에 CSV/XLSX를 여러 개 올리고, 열을 연결해 합칩니다. 중복 제거, 날짜·통화 정리, 미리보기, 승인 뒤에 XLSX를 내보냅니다. 수식은 계산하지 않고 저장된 값만 읽습니다. 환율 변환, OCR, 소수점 로케일 자동 판별은 하지 않습니다. `1.234,56`처럼 쉼표가 소수점인 값은 원문을 유지합니다.

날짜로 읽는 형식: `2026-11-02`, `2026.11.02`, `2026/11/02`, `2026년 11월 2일`, `20261102`, 엑셀 날짜 일련번호. `11/13/2026`처럼 월·일 순서가 애매하면 입력 형식을 일/월/년 또는 월/일/년으로 바꾼 뒤 미리보기를 다시 만듭니다.

통화로 읽는 형식: `1,200,000원`, `₩850,000`, `￦15,000`, `$12,000`, `(35,000원)`. 한 열에 통화가 섞이면 그 열은 변환하지 않습니다.

파일당 10MB, 전체 50,000행, 시트 15개, 시트당 100열. 설정을 바꾸면 승인은 취소됩니다. 중복 제거는 기본으로 꺼져 있고, 기준 열이 모두 비어 있는 행은 지우지 않습니다.
