# 도와유 (dowwalabs.com)

유튜브 코칭 브랜드 "도와유"의 소개 홈페이지. **빌드 도구가 없는 정적 사이트**로, HTML·CSS·JS를 고치면 그대로 배포됩니다.

- 운영 사이트: https://dowwalabs.com
- 호스팅: Vercel (GitHub `main` 브랜치 푸시 시 자동 배포)

## 기술 구성

| 항목 | 내용 |
|---|---|
| 빌드 | 없음 (번들러·트랜스파일러 미사용) |
| 프레임워크 | 없음 (바닐라 HTML/CSS/JS) |
| 의존성 | 없음 (`package.json` 자체가 없음) |
| 외부 API | rss2json (네이버 블로그·유튜브 피드 변환) |

## 파일 구조

```
.
├── index.html       # 전체 페이지 + 인라인 스크립트 (약 1,700줄)
├── css/style.css    # 전체 스타일
├── js/nav.js        # 페이지 전환 함수 nav(pageId)
├── image/           # 이미지·동영상 자산 (57개)
├── vercel.json      # 리다이렉트 + 보안 헤더
├── robots.txt / sitemap.xml / llms.txt
└── CLAUDE.md        # 작업 가이드 (구조·네이밍 규칙 상세)
```

`index.html` 한 파일에 `<section class="page">` 8개가 들어 있고, 사이드바 클릭 시 `nav('id')`가 한 섹션만 `display:block`으로 바꿔 SPA처럼 동작합니다. URL 해시(`#youtube` 등)로 개별 페이지 공유도 됩니다.

구조·CSS 네이밍 규칙·컴포넌트 중복 위치 등 **실제 수정 시 필요한 내용은 [CLAUDE.md](CLAUDE.md)에 정리돼 있습니다. 코드를 건드리기 전에 먼저 읽어보세요.**

## 로컬에서 실행하기

### 권장: 로컬 HTTP 서버

`index.html`을 파일로 직접 열면(`file://`) 블로그·유튜브 피드를 가져오는 `fetch`가 CORS에 막혀 해당 영역이 비어 보입니다. 간단한 정적 서버로 띄우세요.

```bash
# Python 3
python -m http.server 5173

# 또는 Node (npx)
npx serve -l 5173
```

브라우저에서 http://localhost:5173 접속.

### 빠른 확인만 할 때

레이아웃·스타일만 보면 되는 경우에는 `index.html`을 브라우저로 바로 열어도 됩니다. 블로그·유튜브 섹션만 비어 보이고 나머지는 정상 동작합니다.

## 배포

**`main` 브랜치에 푸시하면 Vercel이 자동으로 빌드·배포합니다.** 별도 명령이 필요 없습니다.

```bash
git add -A
git commit -m "변경 내용"
git push origin main
```

배포 상태는 Vercel 대시보드에서 확인할 수 있고, 보통 1~2분 안에 반영됩니다. 브라우저 캐시 때문에 바로 안 보이면 Ctrl+F5로 강력 새로고침하세요.

### vercel.json이 하는 일

- `www.dowwalabs.com` → `dowwalabs.com` 301 리다이렉트
- 보안 헤더: CSP, HSTS, `X-Frame-Options: DENY`, `X-Content-Type-Options`, Referrer-Policy, Permissions-Policy

> **주의** — CSP의 `connect-src`가 `'self' https://api.rss2json.com`으로 제한돼 있습니다. 새로운 외부 API를 호출하는 코드를 추가하면 이 값에 도메인을 추가해야 브라우저가 차단하지 않습니다.

## 연동된 외부 서비스

코드에 하드코딩된 공개 식별자입니다. 비밀값이 아니며, 변경 시 `index.html`에서 grep으로 모두 찾아 일괄 교체하세요.

| 항목 | 값 |
|---|---|
| GA4 측정 ID | `G-K1VM7T84HM` |
| 유튜브 채널 (도와유) | `UCmd6ESuIOTy4MyGSCWnvZHA` |
| 유튜브 채널 (비즈니스설계자 도와쌤) | `UC4MEN7SxmXmt7fdGZNDcGsg` |
| 네이버 블로그 | `blog.naver.com/diet-999` |
| 카카오톡 채널 | `pf.kakao.com/_xotYHn` |
| 신청서 (Tally) | `tally.so/r/68KDlA` |
| 전자책 | `geekus.kr/10xburopt/classroom/736` |

## 자주 하는 수정

**유튜브 채널 추가** — `index.html` 하단 스크립트의 `YT_CHANNELS` 배열에 한 줄 추가하고, 유튜브 섹션에 `yt-channel` 블록을 복제한 뒤 새 `gridId`를 부여하면 됩니다.

```js
var YT_CHANNELS = [
  { id: 'UC...', gridId: 'ytGrid',  label: '채널명', cacheKey: 'dy_yt_v2' },
  // 여기에 추가
];
```

**색상 변경** — `css/style.css`의 `:root`에 정의된 디자인 토큰(`--gold`, `--bg` 등)만 고치면 전체에 반영됩니다.

**이미지 교체** — `image/` 폴더에 같은 파일명으로 덮어쓰면 HTML 수정 없이 반영됩니다. 파일명에 공백·한글이 있으면 HTML에서 URL 인코딩이 필요합니다.

## 알아둘 점

- **비밀정보 없음.** 이 저장소에는 API 키·토큰·비밀번호가 포함돼 있지 않습니다. 모든 외부 연동이 클라이언트 측 공개 식별자만 사용합니다. `.gitignore`가 `.vercel`, `.claude/`, `node_modules/` 등을 제외합니다.
- **일부 컴포넌트가 여러 페이지에 복제돼 있습니다.** 수강생 사례 슬라이더, 후기 마퀴 등은 두 곳에 같은 마크업이 들어 있어 한쪽만 고치면 불일치가 생깁니다. 위치는 [CLAUDE.md](CLAUDE.md)의 "재사용되는 컴포넌트" 표를 참고하세요.
- **모바일 반응형은 부분 대응 상태입니다.** 페이지별로 점진적으로 작업 중입니다.
- **홈 화면의 유튜브 카드 3개는 정적 마크업입니다.** 유튜브 탭은 RSS로 자동 갱신되지만 홈은 수동으로 바꿔야 합니다.
