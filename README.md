# BET-PL

사내 구성원이 가상 포인트로 EPL 경기 결과를 예측하는 React + Node.js 서비스입니다. 포인트는 구매·출금·현금 교환할 수 없습니다.

## 로컬 실행

요구 사항: Node.js 22~24, pnpm 11.8+, PostgreSQL

```bash
cp .env.example .env
# .env에 DATABASE_URL과 FOOTBALL_DATA_TOKEN 입력
pnpm install
pnpm run db:migrate
pnpm run create-admin -- admin
pnpm dev
```

- React: `http://localhost:5173`
- Express API: `http://localhost:3000`
- football-data.org 토큰이 없어도 서버는 실행되지만 EPL 동기화는 사용할 수 없습니다.

## 주요 규칙

- 신규 계정 1,000P, 매주 월요일 첫 활동 시 1,000P 추가
- 홈승/무승부/원정승 중 하나를 선택하고 킥오프 전까지 변경·취소
- 최종 배당률을 적중 베팅금액에 적용하고, 이월 잭팟은 적중 베팅 비율로 추가 지급
- 정수 나눗셈 나머지와 무적중 풀은 다음 킥오프 경기로 이월

## 무료 배포

1. [Neon](https://neon.com/)에서 Singapore 리전의 무료 PostgreSQL 프로젝트를 만들고 pooled connection string을 복사합니다.
2. [football-data.org](https://www.football-data.org/client/register) 무료 토큰을 발급합니다.
3. GitHub 저장소를 Render Blueprint로 연결해 `render.yaml`을 적용합니다.
4. Render 환경변수 `DATABASE_URL`, `FOOTBALL_DATA_TOKEN`을 입력합니다.
5. 최초 배포 후 로컬에서 운영 DB 주소를 사용해 관리자를 생성합니다.

```bash
DATABASE_URL='postgresql://...' pnpm run create-admin -- admin
```

Render 무료 Web Service는 15분 미사용 시 휴면되어 첫 요청이 느릴 수 있습니다. DB 스키마는 서버 시작 시 안전하게 적용됩니다.

## 명령

```bash
pnpm test          # 정산·주간 지급 규칙
pnpm build         # React 프로덕션 빌드
pnpm start         # 스키마 적용 후 Express 실행
pnpm run db:migrate
```
