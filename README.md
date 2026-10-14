# DataTalk 발표자료

발표 주소: https://ddllddbb8676-cloud.github.io/datatalk-presentation/

17장 발표입니다. 좌우 방향키로 이동하고, 하단 `발표 대본 ↗` 또는 `S`를 누르면 대본이 별도 창으로 열립니다. 창의 제목 표시줄을 잡아 다른 모니터로 옮기고 크기를 조절할 수 있습니다. 슬라이드와 대본은 자동으로 동기화되며, 대본 창에서도 방향키나 이전·다음 버튼으로 발표를 진행할 수 있습니다. 여러 장에 걸친 대본은 읽던 스크롤 위치를 유지합니다. 팝업이 차단되면 기존 대본 창과 허용 안내를 표시합니다. 모바일은 가로 보기를 권장합니다. 시연은 가상 데이터를 사용합니다.

## 어디를 수정하나요?

| 수정할 내용 | 파일 |
| --- | --- |
| 슬라이드 문구·구성·발표 대본 | `index.html` |
| 발표 색상·배치·글자 크기 | `css/presentation.css` |
| 14~17장 후반부 화면 | `css/presentation-ending.css` |
| 페이지 이동·전체화면·목차 | `js/presentation.js` |
| 시연 타이핑·확대·축소·전환 | `js/review.js` |
| 별도 대본 창·슬라이드 동기화 | `speaker.html`, `js/speaker.js`, `css/speaker.css` |
| 시연 앱 화면 구조 | `demo.html` |
| 시연 앱 디자인 | `css/demo.css` |
| 시연 앱 동작 | `js/demo-app.js` |
| 그래프·시각화 동작 | `js/demo-visuals.js` |
| 대화·표·분석용 가상 데이터 | `data/ui-fixture.js` |
| 기타 발표 설정·데이터 | `data/` |
| 이미지 | `images/` |
| 글꼴 | `fonts/`와 `css/*-fonts.css` |
| ECharts 원본 라이브러리 | `vendor/echarts.min.js` |

`data/*.js`는 데이터 객체 뒤에 원래 JSON 요소를 생성하는 짧은 코드가 붙어 있습니다. 데이터 값만 수정하고 아래 로딩 코드는 유지합니다. 대본의 화면 표시 문구는 `index.html`이 기준입니다.

## 수정·재배포

1. 수정할 파일만 편집합니다. 이미지나 글꼴을 변경하지 않았다면 다시 올리지 않습니다.
2. 바뀐 파일을 이 저장소의 `main` 브랜치에 커밋합니다.
3. Actions의 `pages build and deployment`가 성공하면 같은 주소에 반영됩니다. 이전 화면이 남으면 새로고침합니다.

일상적인 수정에는 빌드·압축·분할 업로드가 필요하지 않습니다. 별도의 사내용 HTML도 만들지 않습니다. 모든 자산은 이 저장소에서 제공하며 외부 CDN에 의존하지 않습니다.

## 로컬 미리보기

저장소 폴더에서 `python3 -m http.server 8000`을 실행한 뒤 `http://localhost:8000`을 엽니다. 파일을 더블클릭하는 방식은 시연 프레임의 브라우저 보안 제약 때문에 사용하지 않습니다.

`asset-manifest.json`은 최초 분리 시점의 파일 목록과 해시 기록이며 실행에 사용되지 않습니다.
