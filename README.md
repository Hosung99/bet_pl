# BET-PL

가상 포인트로 EPL 경기 결과를 예측하는 React + Node.js 서비스입니다. 포인트는 구매·출금·현금 교환할 수 없습니다.

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

- 신규 계정 1,000P, 서울 시간 기준 하루 첫 접속 시 출석 포인트 200P 추가
- 홈승/무승부/원정승 중 하나를 선택하고 킥오프 전까지 변경·취소
- 최종 배당률을 적중 베팅금액에 적용하고, 이월 잭팟은 적중 베팅 비율로 추가 지급
- 정수 나눗셈 나머지와 무적중 풀은 다음 킥오프 경기로 이월
