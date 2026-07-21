# 전국 주간 날씨 대시보드

기상청 단기예보·중기예보(공공데이터포털) 기반 전국 14개 지역 7일 날씨 대시보드.
PC 버전(`index.html`)과 모바일 버전(`mobile.html`)이 있으며, 모바일 기기 접속 시 자동으로 모바일 버전으로 이동합니다.

API 키는 HTML에 포함되지 않고 Netlify 서버 함수(환경변수)에서만 사용됩니다.

## 배포 방법 (GitHub + Netlify, 모두 무료)

### 1. GitHub에 올리기
1. https://github.com 로그인 → 우측 상단 **+** → **New repository**
2. 이름 예: `weather-dashboard`, **Public** 선택 → **Create repository**
3. **uploading an existing file** 링크 클릭 → 이 폴더(deploy) 안의 내용물 전부를 드래그&드롭
   - `index.html`, `mobile.html`, `netlify.toml`, `README.md`, `netlify` 폴더
   - 폴더째 드래그하면 구조가 유지됩니다 (`netlify/functions/weather.js` 경로 확인)
4. **Commit changes**

### 2. Netlify로 배포하기
1. https://app.netlify.com → **Sign up with GitHub** (무료)
2. **Add new site** → **Import an existing project** → **GitHub** → 방금 만든 저장소 선택
3. 빌드 설정은 그대로 두고(빌드 명령 없음, Publish directory: `.`) → **Deploy**
4. **Site configuration → Environment variables → Add a variable**
   - Key: `KMA_KEY`
   - Value: 공공데이터포털 인증키 입력
5. **Deploys** 탭 → **Trigger deploy → Deploy site** (환경변수 반영을 위해 재배포)

### 3. 공유
`https://사이트이름.netlify.app` 주소가 생깁니다. 이 주소를 공유하면 됩니다.
사이트 이름은 Site configuration → Change site name에서 바꿀 수 있습니다.

## 파일 구성
```
index.html                    # PC 버전 (모바일 접속 시 mobile.html로 자동 이동)
mobile.html                   # 모바일 버전 (갤럭시 S25 등 360~412px 최적화)
netlify.toml                  # Netlify 설정 (/api/weather → 함수 연결)
netlify/functions/weather.js  # API 프록시 함수 (KMA_KEY 환경변수 사용)
```

## 데이터 출처
- 오늘~D+3: 기상청 단기예보 (최신 발표 + 02시 발표 병합)
- D+4~D+6: 기상청 중기예보 (육상예보 + 중기기온, 18시 발표의 빈 항목은 직전 발표로 보완)
q
- 강수량(mm)은 단기예보 구간만 제공 (중기예보는 강수확률 %만 제공)

