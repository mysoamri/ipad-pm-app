# 아이패드 프로젝트 일정관리 PWA

맥의 dashboard 와 별개로 도는 standalone 웹 앱. 데이터는 Google Drive 의
`DashboardApp/pm/project_db.json` 한 파일을 양쪽이 보고 동기화한다.

설계 문서: `../docs/IPAD_PM_DESIGN.md`

## 개발 (로컬 미리보기)

```bash
cd ipad-pm
npm install
npm run dev
```

`http://localhost:5174` 에서 미리보기. service worker 는 dev 모드에선
비활성(캐시 충돌 방지). 빌드 산출물에서만 등록.

## 빌드 (GitHub Pages 배포용)

```bash
# GitHub Pages 의 서브경로(예: /ipad-pm-host/)에 올릴 거면 base 를 맞춰서 빌드
VITE_BASE_PATH=/<repo-name>/ npm run build
```

`dist/` 가 생성된다. 이 폴더 내용을 GitHub repo 의 `gh-pages` 브랜치
또는 별도 호스팅용 repo 에 푸시하면 `https://<user>.github.io/<repo>/` 로 열린다.

## 폴더 구조

```
ipad-pm/
  index.html
  vite.config.js
  package.json
  public/
    manifest.webmanifest   PWA 매니페스트
    icon-192.svg / icon-512.svg
    sw.js                  서비스워커 (precache + 런타임 캐시)
  src/
    main.jsx              SW 등록 + React mount
    App.jsx               (3단계) 빈 껍데기 화면
    db.js                 Dexie(IndexedDB) 스키마
    index.css             글로벌 + iOS Safari 보강
```

## 다음 단계

- 4단계: 화면 이식 (프로젝트 목록 → 작업 → 마일스톤 → WBS → 메모)
- 5단계: Google Drive API 직접 통신 (drive.file scope OAuth + sync 사이클)
- 6단계: GitHub Pages 호스팅 가이드
