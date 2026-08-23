import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api } from "./api.js";

const PICKS = [
  ["HOME", "홈승"],
  ["DRAW", "무승부"],
  ["AWAY", "원정승"],
];
const MATCH_PAGE_SIZE = 8;

const point = new Intl.NumberFormat("ko-KR");
const dateTime = new Intl.DateTimeFormat("ko-KR", {
  timeZone: "Asia/Seoul",
  month: "long",
  day: "numeric",
  weekday: "short",
  hour: "2-digit",
  minute: "2-digit",
});
const dayLabel = new Intl.DateTimeFormat("ko-KR", {
  timeZone: "Asia/Seoul",
  month: "long",
  day: "numeric",
  weekday: "long",
});
const timeLabel = new Intl.DateTimeFormat("ko-KR", {
  timeZone: "Asia/Seoul",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

function formatPoint(value) {
  return `${point.format(Number(value || 0))}P`;
}

function pickLabel(pick) {
  return PICKS.find(([key]) => key === pick)?.[1] || "-";
}

function teamInitial(name) {
  return String(name || "?")
    .split(" ")
    .map((word) => word[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

function TeamCrest({ src, name }) {
  const [failed, setFailed] = useState(false);
  if (!src || failed)
    return (
      <span className="crest-fallback" aria-hidden="true">
        {teamInitial(name)}
      </span>
    );
  return (
    <img
      className="team-crest"
      src={src}
      alt=""
      onError={() => setFailed(true)}
    />
  );
}

function Login({ onLogin }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(event) {
    event.preventDefault();
    setLoading(true);
    setError("");
    try {
      const result = await api("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ username, password }),
      });
      onLogin(result.user);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="login-page">
      <section className="login-pitch" aria-label="BET-PL 로그인">
        <div className="brand brand-large login-brand">
          <span className="brand-mark">BP</span>
          <span>
            <strong>BET-PL</strong>
            <small>PRIVATE EPL PREDICTION LEAGUE</small>
          </span>
        </div>
        <div className="login-copy">
          <p className="matchday-label"><span>2026 / 27</span> OFFICE LEAGUE</p>
          <h1>
            킥오프 전,
            <strong>당신의 선택.</strong>
          </h1>
          <p>
            승·무·패를 예측하고 동료들과 포인트 순위를 겨룹니다.
          </p>
        </div>
        <div className="tunnel-status" aria-hidden="true">
          <span>SEOUL</span>
          <span>PRE-MATCH ACCESS</span>
          <span>MEMBERS ONLY</span>
        </div>
      </section>
      <section className="login-panel">
        <form className="login-form" onSubmit={submit}>
          <div className="pass-header">
            <div className="pass-brand">
              <span className="brand-mark">BP</span>
              <span><strong>BET-PL</strong><small>PLAYER ACCESS</small></span>
            </div>
            <b>26/27</b>
          </div>
          <div className="pass-details" aria-hidden="true">
            <span>COMPETITION <b>PREMIER LEAGUE</b></span>
            <span>ZONE <b>SEOUL</b></span>
          </div>
          <div className="pass-body">
            <p className="eyebrow">MATCHDAY CREDENTIAL</p>
            <h2>매치룸 입장</h2>
            <p className="muted">관리자가 발급한 계정으로 입장하세요.</p>
            <label>
              <span>아이디</span>
              <input
                autoComplete="username"
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                required
              />
            </label>
            <label>
              <span>비밀번호</span>
              <input
                type="password"
                autoComplete="current-password"
                minLength="8"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
              />
            </label>
            {error && (
              <p className="form-error" role="alert">
                {error}
              </p>
            )}
            <button className="primary-button full-button" disabled={loading}>
              {loading ? "입장 확인 중…" : "매치룸 입장"}
            </button>
          </div>
          <div className="pass-footer" aria-hidden="true">
            <span>AUTHORIZED PLAYERS ONLY</span>
            <span className="pass-bars" />
            <b>BP-PL-26</b>
          </div>
        </form>
      </section>
    </main>
  );
}

function Stat({ label, value, accent }) {
  return (
    <div className={`stat ${accent ? "stat-accent" : ""}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function Hero({
  match,
  balance,
  activeBets,
  position,
  total,
  onPrevious,
  onNext,
}) {
  if (!match) {
    return (
      <section className="hero hero-empty">
        <p className="eyebrow">NEXT KICKOFF</p>
        <h1>예정된 경기가 없습니다.</h1>
        <p>관리자에게 EPL 일정 동기화를 요청하세요.</p>
      </section>
    );
  }
  const totalPool =
    Number(match.home_pool) +
    Number(match.draw_pool) +
    Number(match.away_pool) +
    Number(match.carryover);
  return (
    <section className="hero">
      <div className="hero-main">
        <div className="hero-meta">
          <p className="eyebrow">
            THE NEXT MATCH · {dateTime.format(new Date(match.utc_date))}
          </p>
          <span>MATCHDAY {match.matchday || "—"}</span>
        </div>
        <div className="hero-fixture">
          <div>
            <TeamCrest
              key={`${match.id}-home`}
              src={match.home_team_crest}
              name={match.home_team_name}
            />
            <span className="hero-team-name">
              <small>HOME</small>
              <strong>{match.home_team_name}</strong>
            </span>
          </div>
          <span className="versus">VS</span>
          <div>
            <TeamCrest
              key={`${match.id}-away`}
              src={match.away_team_crest}
              name={match.away_team_name}
            />
            <span className="hero-team-name">
              <small>AWAY</small>
              <strong>{match.away_team_name}</strong>
            </span>
          </div>
        </div>
        {total > 1 && (
          <div className="hero-nav" aria-label="예정 경기 이동">
            <button
              type="button"
              aria-label="이전 경기"
              disabled={position === 1}
              onClick={onPrevious}
            >
              ←
            </button>
            <span>
              {position} / {total}
            </span>
            <button
              type="button"
              aria-label="다음 경기"
              disabled={position === total}
              onClick={onNext}
            >
              →
            </button>
          </div>
        )}
      </div>
      <aside className="hero-board" aria-label="내 현황">
        <Stat label="MY WALLET" value={formatPoint(balance)} accent />
        <Stat label="ACTIVE BETS" value={`${activeBets}경기`} />
        <Stat label="현재 베팅금액" value={formatPoint(totalPool)} />
      </aside>
    </section>
  );
}

function OddsButton({ pick, label, selected, pool, total, disabled, onClick }) {
  const odds = Number(pool) > 0 ? (total / Number(pool)).toFixed(2) : "—";
  return (
    <button
      type="button"
      className={`odds-button ${selected ? "selected" : ""}`}
      disabled={disabled}
      onClick={onClick}
    >
      <span>{label}</span>
      <strong>{odds}</strong>
      <small>{formatPoint(pool)}</small>
    </button>
  );
}

function MatchCard({ match, onSaved, notify }) {
  const [pick, setPick] = useState(
    match.my_bet_status === "CANCELLED" ? "" : match.my_prediction || "",
  );
  const [stake, setStake] = useState(
    match.my_bet_status === "CANCELLED" ? "" : match.my_stake || "",
  );
  const [saving, setSaving] = useState(false);
  const kickoff = new Date(match.utc_date);
  const locked =
    kickoff <= new Date() || ["FINISHED", "CANCELLED"].includes(match.status);
  const pools = {
    HOME: match.home_pool,
    DRAW: match.draw_pool,
    AWAY: match.away_pool,
  };
  const total =
    Number(match.home_pool) +
    Number(match.draw_pool) +
    Number(match.away_pool) +
    Number(match.carryover);

  async function save() {
    if (!pick)
      return notify("홈승, 무승부, 원정승 중 하나를 선택하세요.", "error");
    const amount = Number(stake);
    if (!Number.isSafeInteger(amount) || amount <= 0 || amount % 100 !== 0)
      return notify("베팅 포인트는 100P 단위로 입력하세요.", "error");
    setSaving(true);
    try {
      const result = await api(`/api/bets/${match.id}`, {
        method: "PUT",
        body: JSON.stringify({ prediction: pick, stake: amount }),
      });
      notify("베팅을 저장했습니다.");
      onSaved(result.balance);
    } catch (error) {
      notify(error.message, "error");
    } finally {
      setSaving(false);
    }
  }

  async function cancel() {
    setSaving(true);
    try {
      const result = await api(`/api/bets/${match.id}`, { method: "DELETE" });
      setPick("");
      setStake("");
      notify("베팅을 취소하고 포인트를 돌려드렸습니다.");
      onSaved(result.balance);
    } catch (error) {
      notify(error.message, "error");
    } finally {
      setSaving(false);
    }
  }

  function adjustStake(step) {
    const amount = Number(stake) || 0;
    const aligned =
      (step > 0 ? Math.floor(amount / 100) : Math.ceil(amount / 100)) * 100;
    setStake(String(Math.max(100, aligned + step)));
  }

  return (
    <article
      id={`match-${match.id}`}
      className={`match-card ${locked ? "match-locked" : ""}`}
    >
      <header className="match-card-head">
        <span className="kickoff-time">{timeLabel.format(kickoff)}</span>
        <span className={`status status-${match.status.toLowerCase()}`}>
          {match.status === "FINISHED"
            ? "경기 종료"
            : locked
              ? "마감"
              : "베팅 오픈"}
        </span>
        {Number(match.carryover) > 0 && (
          <span className="jackpot">
            JACKPOT {formatPoint(match.carryover)}
          </span>
        )}
      </header>
      <div className="match-teams">
        <div className="team home-team">
          <TeamCrest src={match.home_team_crest} name={match.home_team_name} />
          <span className="team-name">
            <small>HOME</small>
            <strong>{match.home_team_name}</strong>
          </span>
        </div>
        <div className="score-zone">
          {match.status === "FINISHED" ? (
            <strong className="final-score">
              {match.home_score} : {match.away_score}
            </strong>
          ) : (
            <span>VS</span>
          )}
          <small>MW {match.matchday || "-"}</small>
        </div>
        <div className="team away-team">
          <TeamCrest src={match.away_team_crest} name={match.away_team_name} />
          <span className="team-name">
            <small>AWAY</small>
            <strong>{match.away_team_name}</strong>
          </span>
        </div>
      </div>
      <div className="odds-grid" aria-label="승부 선택과 현재 예상 배당">
        {PICKS.map(([key, label]) => (
          <OddsButton
            key={key}
            pick={key}
            label={label}
            pool={pools[key]}
            total={total}
            selected={pick === key}
            disabled={locked}
            onClick={() => setPick(key)}
          />
        ))}
      </div>
      {!locked && (
        <div className="bet-controls">
          <div className="stake-stepper">
            <button
              type="button"
              aria-label="베팅 포인트 100 감소"
              disabled={saving || !stake || Number(stake) <= 100}
              onClick={() => adjustStake(-100)}
            >
              −
            </button>
            <input
              type="number"
              inputMode="numeric"
              aria-label="베팅 포인트"
              min="100"
              step="100"
              placeholder="100P 단위"
              value={stake}
              onChange={(event) => setStake(event.target.value)}
            />
            <button
              type="button"
              aria-label="베팅 포인트 100 증가"
              disabled={saving || Number(stake) >= 1_000_000_000}
              onClick={() => adjustStake(100)}
            >
              +
            </button>
          </div>
          <button
            className="primary-button"
            type="button"
            disabled={saving}
            onClick={save}
          >
            {saving
              ? "저장 중…"
              : match.my_bet_status === "PENDING"
                ? "베팅 변경"
                : "베팅하기"}
          </button>
          {match.my_bet_status === "PENDING" && (
            <button
              className="text-button danger"
              type="button"
              disabled={saving}
              onClick={cancel}
            >
              취소
            </button>
          )}
        </div>
      )}
      {match.my_bet_status && match.my_bet_status !== "CANCELLED" && (
        <footer className="my-ticket">
          <span>MY PICK</span>
          <strong>
            {pickLabel(match.my_prediction)} · {formatPoint(match.my_stake)}
          </strong>
          {match.my_bet_status === "WON" && (
            <em>+{formatPoint(match.my_payout)}</em>
          )}
          {match.my_bet_status === "LOST" && <em className="lost">미적중</em>}
        </footer>
      )}
      <footer className="bettors">
        <span>BETTORS</span>
        <strong>{match.bettors?.join(", ") || "아직 없음"}</strong>
      </footer>
    </article>
  );
}

function Dashboard({
  matches,
  user,
  onSaved,
  notify,
  focusedMatchId,
  onFocusHandled,
}) {
  const [showFinished, setShowFinished] = useState(false);
  const [heroMatchId, setHeroMatchId] = useState(null);
  const [visibleCount, setVisibleCount] = useState(MATCH_PAGE_SIZE);
  const loadMoreRef = useRef(null);

  useEffect(() => setVisibleCount(MATCH_PAGE_SIZE), [showFinished]);

  useEffect(() => {
    if (!focusedMatchId) return;
    setShowFinished(false);
    const targetIndex = matches
      .filter((match) => match.status !== "FINISHED")
      .findIndex((match) => Number(match.id) === Number(focusedMatchId));
    if (targetIndex >= visibleCount) {
      setVisibleCount(targetIndex + 1);
      return;
    }
    const frame = window.requestAnimationFrame(() => {
      const card = document.getElementById(`match-${focusedMatchId}`);
      if (!card) return;
      card.scrollIntoView({
        behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
          ? "auto"
          : "smooth",
        block: "center",
      });
      card.querySelector("input")?.focus({ preventScroll: true });
      onFocusHandled(null);
    });
    return () => window.cancelAnimationFrame(frame);
  }, [focusedMatchId, matches, onFocusHandled, visibleCount]);

  const filtered = matches.filter((match) =>
    showFinished ? match.status === "FINISHED" : match.status !== "FINISHED",
  );
  const visible = filtered.slice(0, visibleCount);
  const hasMore = visible.length < filtered.length;

  useEffect(() => {
    if (
      !hasMore ||
      !loadMoreRef.current ||
      !("IntersectionObserver" in window)
    )
      return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting)
          setVisibleCount((count) =>
            Math.min(count + MATCH_PAGE_SIZE, filtered.length),
          );
      },
      { rootMargin: "300px" },
    );
    observer.observe(loadMoreRef.current);
    return () => observer.disconnect();
  }, [hasMore, filtered.length]);

  const groups = visible.reduce((result, match) => {
    const day = dayLabel.format(new Date(match.utc_date));
    if (!result[day]) result[day] = [];
    result[day].push(match);
    return result;
  }, {});
  const upcoming = matches.filter(
    (match) =>
      new Date(match.utc_date) > new Date() &&
      !["FINISHED", "CANCELLED"].includes(match.status),
  );
  const heroIndex = Math.max(
    0,
    upcoming.findIndex((match) => match.id === heroMatchId),
  );
  const next = upcoming[heroIndex];
  const activeBets = matches.filter(
    (match) => match.my_bet_status === "PENDING",
  ).length;

  return (
    <>
      <Hero
        match={next}
        balance={user.balance}
        activeBets={activeBets}
        position={heroIndex + 1}
        total={upcoming.length}
        onPrevious={() => setHeroMatchId(upcoming[heroIndex - 1].id)}
        onNext={() => setHeroMatchId(upcoming[heroIndex + 1].id)}
      />
      <div className="section-head">
        <div>
          <p className="eyebrow">MATCHDAY PROGRAMME</p>
          <h2>{showFinished ? "종료 경기" : "다가오는 경기"}</h2>
        </div>
        <div className="segmented">
          <button
            className={!showFinished ? "active" : ""}
            onClick={() => setShowFinished(false)}
          >
            예정
          </button>
          <button
            className={showFinished ? "active" : ""}
            onClick={() => setShowFinished(true)}
          >
            종료
          </button>
        </div>
      </div>
      {Object.keys(groups).length === 0 && (
        <Empty
          title="표시할 경기가 없습니다."
          body="일정을 동기화하거나 다른 경기 상태를 선택하세요."
        />
      )}
      {Object.entries(groups).map(([day, fixtures]) => (
        <section className="fixture-day" key={day}>
          <h3>
            <span>{day}</span>
            <small>{fixtures.length} MATCHES</small>
          </h3>
          <div className="match-grid">
            {fixtures.map((match) => (
              <MatchCard
                key={match.id}
                match={match}
                onSaved={onSaved}
                notify={notify}
              />
            ))}
          </div>
        </section>
      ))}
      {hasMore && (
        <button
          ref={loadMoreRef}
          className="load-more"
          type="button"
          onClick={() =>
            setVisibleCount((count) =>
              Math.min(count + MATCH_PAGE_SIZE, filtered.length),
            )
          }
        >
          다음 경기 더 보기
          <small>
            {visible.length} / {filtered.length}
          </small>
        </button>
      )}
    </>
  );
}

function Empty({ title, body }) {
  return (
    <div className="empty">
      <span>0–0</span>
      <h3>{title}</h3>
      <p>{body}</p>
    </div>
  );
}

function BetHistory({ bets, onEdit }) {
  if (!bets.length)
    return (
      <Empty
        title="아직 베팅이 없습니다."
        body="경기 보드에서 첫 예측을 남겨보세요."
      />
    );
  return (
    <section>
      <div className="section-head">
        <div>
          <p className="eyebrow">MY TICKETS</p>
          <h2>베팅 내역</h2>
        </div>
      </div>
      <div className="ticket-list">
        {bets.map((bet) => {
          const editable =
            bet.status === "PENDING" && new Date(bet.utc_date) > new Date();
          return (
            <button
              type="button"
              className={`ticket-row ${editable ? "ticket-editable" : ""}`}
              key={bet.id}
              disabled={!editable}
              onClick={() => onEdit(bet.match_id)}
            >
              <div className="ticket-teams">
                <TeamCrest
                  src={bet.home_team_crest}
                  name={bet.home_team_name}
                />
                <span>
                  {bet.home_team_name}
                  <small>{dateTime.format(new Date(bet.utc_date))}</small>
                </span>
                <b>
                  {bet.status === "PENDING"
                    ? "VS"
                    : `${bet.home_score} : ${bet.away_score}`}
                </b>
                <span>{bet.away_team_name}</span>
                <TeamCrest
                  src={bet.away_team_crest}
                  name={bet.away_team_name}
                />
              </div>
              <div className="ticket-result">
                <span>
                  {pickLabel(bet.prediction)} · {formatPoint(bet.stake)}
                </span>
                <strong className={`result-${bet.status.toLowerCase()}`}>
                  {bet.status === "WON"
                    ? `+${formatPoint(bet.payout)}`
                    : bet.status === "LOST"
                      ? "미적중"
                      : editable
                        ? "진행 중 · 수정 →"
                        : "마감"}
                </strong>
              </div>
            </button>
          );
        })}
      </div>
    </section>
  );
}

function Leaderboard({ users, currentUser }) {
  return (
    <section>
      <div className="section-head">
        <div>
          <p className="eyebrow">OFFICE TABLE</p>
          <h2>포인트 순위</h2>
        </div>
        <p className="section-note">잔액 · 적중 수 기준</p>
      </div>
      <div className="leaderboard">
        <div className="leaderboard-head">
          <span>순위</span>
          <span>플레이어</span>
          <span>적중 / 정산</span>
          <span>포인트</span>
        </div>
        {users.map((entry, index) => (
          <div
            className={`leaderboard-row ${Number(entry.id) === Number(currentUser.id) ? "is-me" : ""}`}
            key={entry.id}
          >
            <strong className="rank">
              {String(index + 1).padStart(2, "0")}
            </strong>
            <span className="player">
              <i>{entry.username.slice(0, 2).toUpperCase()}</i>
              <b>{entry.username}</b>
              {Number(entry.id) === Number(currentUser.id) && (
                <small>YOU</small>
              )}
            </span>
            <span>
              {entry.wins} / {entry.settled_bets}
            </span>
            <strong>{formatPoint(entry.balance)}</strong>
          </div>
        ))}
      </div>
    </section>
  );
}

function UserRow({ entry, currentUser, run, notify }) {
  const [amount, setAmount] = useState("");

  async function adjust() {
    try {
      await run(() =>
        api(`/api/admin/users/${entry.id}/points`, {
          method: "POST",
          body: JSON.stringify({ amount: Number(amount) }),
        }),
      );
      setAmount("");
      notify("포인트를 조정했습니다.");
    } catch (error) {
      notify(error.message, "error");
    }
  }

  async function resetPassword() {
    const password = window.prompt(
      `${entry.username}의 새 비밀번호를 입력하세요. (8자 이상)`,
    );
    if (!password) return;
    try {
      await run(() =>
        api(`/api/admin/users/${entry.id}/password`, {
          method: "POST",
          body: JSON.stringify({ password }),
        }),
      );
      notify("비밀번호를 변경하고 기존 세션을 종료했습니다.");
    } catch (error) {
      notify(error.message, "error");
    }
  }

  async function toggle() {
    try {
      await run(() =>
        api(`/api/admin/users/${entry.id}`, {
          method: "PATCH",
          body: JSON.stringify({ active: !entry.active }),
        }),
      );
      notify(
        entry.active ? "계정을 비활성화했습니다." : "계정을 활성화했습니다.",
      );
    } catch (error) {
      notify(error.message, "error");
    }
  }

  return (
    <div className="admin-user-row">
      <span>
        <b>{entry.username}</b>
        <small>{entry.role}</small>
      </span>
      <strong>{formatPoint(entry.balance)}</strong>
      <label>
        <span className="sr-only">조정 포인트</span>
        <input
          type="number"
          placeholder="+ / - 포인트"
          value={amount}
          onChange={(event) => setAmount(event.target.value)}
        />
      </label>
      <button className="small-button" onClick={adjust}>
        조정
      </button>
      <button className="text-button" onClick={resetPassword}>
        암호 변경
      </button>
      <button
        className="text-button danger"
        disabled={Number(entry.id) === Number(currentUser.id)}
        onClick={toggle}
      >
        {entry.active ? "비활성화" : "활성화"}
      </button>
    </div>
  );
}

function SettleRow({ match, run, notify }) {
  const [home, setHome] = useState(match.home_score ?? "");
  const [away, setAway] = useState(match.away_score ?? "");

  async function settle() {
    try {
      await run(() =>
        api(`/api/admin/matches/${match.id}/settle`, {
          method: "POST",
          body: JSON.stringify({
            homeScore: Number(home),
            awayScore: Number(away),
          }),
        }),
      );
      notify("경기 결과를 정산했습니다.");
    } catch (error) {
      notify(error.message, "error");
    }
  }

  return (
    <div className="settle-row">
      <span>{match.home_team_name}</span>
      <input
        aria-label={`${match.home_team_name} 점수`}
        type="number"
        min="0"
        value={home}
        onChange={(event) => setHome(event.target.value)}
      />
      <b>:</b>
      <input
        aria-label={`${match.away_team_name} 점수`}
        type="number"
        min="0"
        value={away}
        onChange={(event) => setAway(event.target.value)}
      />
      <span>{match.away_team_name}</span>
      <button className="small-button" onClick={settle}>
        {match.settled_at ? "재정산" : "정산"}
      </button>
    </div>
  );
}

function Admin({ users, matches, currentUser, reload, notify }) {
  const [form, setForm] = useState({
    username: "",
    password: "",
    role: "MEMBER",
  });
  const [busy, setBusy] = useState(false);

  async function run(action) {
    setBusy(true);
    try {
      await action();
      await reload();
    } finally {
      setBusy(false);
    }
  }

  async function create(event) {
    event.preventDefault();
    try {
      await run(() =>
        api("/api/admin/users", { method: "POST", body: JSON.stringify(form) }),
      );
      setForm({ username: "", password: "", role: "MEMBER" });
      notify("새 계정을 만들었습니다.");
    } catch (error) {
      notify(error.message, "error");
    }
  }

  async function sync() {
    try {
      let result;
      await run(async () => {
        result = await api("/api/admin/sync", { method: "POST" });
      });
      notify(
        `${result.synced}경기를 동기화하고 ${result.settled}경기를 정산했습니다.`,
      );
    } catch (error) {
      notify(error.message, "error");
    }
  }

  const finished = matches
    .filter((match) => match.status === "FINISHED")
    .slice(-10)
    .reverse();
  return (
    <section>
      <div className="section-head">
        <div>
          <p className="eyebrow">CONTROL ROOM</p>
          <h2>운영 센터</h2>
        </div>
        <button className="primary-button" disabled={busy} onClick={sync}>
          EPL 즉시 동기화
        </button>
      </div>
      <div className="admin-grid">
        <article className="admin-card">
          <header>
            <span>NEW</span>
            <div>
              <h3>계정 생성</h3>
              <p>새 계정에는 1,000P가 지급됩니다.</p>
            </div>
          </header>
          <form className="create-user" onSubmit={create}>
            <input
              placeholder="아이디"
              value={form.username}
              onChange={(event) =>
                setForm({ ...form, username: event.target.value })
              }
              required
            />
            <input
              type="password"
              minLength="8"
              placeholder="비밀번호 8자 이상"
              value={form.password}
              onChange={(event) =>
                setForm({ ...form, password: event.target.value })
              }
              required
            />
            <select
              value={form.role}
              onChange={(event) =>
                setForm({ ...form, role: event.target.value })
              }
            >
              <option value="MEMBER">멤버</option>
              <option value="ADMIN">관리자</option>
            </select>
            <button className="small-button" disabled={busy}>
              계정 만들기
            </button>
          </form>
        </article>
        <article className="admin-card admin-card-wide">
          <header>
            <span>TEAM</span>
            <div>
              <h3>회원과 포인트</h3>
              <p>음수 입력으로 포인트를 차감할 수 있습니다.</p>
            </div>
          </header>
          <div className="admin-users">
            {users.map((entry) => (
              <UserRow
                key={entry.id}
                entry={entry}
                currentUser={currentUser}
                run={run}
                notify={notify}
              />
            ))}
          </div>
        </article>
        <article className="admin-card admin-card-wide">
          <header>
            <span>VAR</span>
            <div>
              <h3>최근 종료 경기</h3>
              <p>API 결과 오류가 있을 때만 점수를 수정해 재정산하세요.</p>
            </div>
          </header>
          <div className="settle-list">
            {finished.length ? (
              finished.map((match) => (
                <SettleRow
                  key={match.id}
                  match={match}
                  run={run}
                  notify={notify}
                />
              ))
            ) : (
              <p className="muted">종료된 경기가 없습니다.</p>
            )}
          </div>
        </article>
      </div>
    </section>
  );
}

export default function App() {
  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [tab, setTab] = useState("dashboard");
  const [matches, setMatches] = useState([]);
  const [bets, setBets] = useState([]);
  const [leaders, setLeaders] = useState([]);
  const [adminUsers, setAdminUsers] = useState([]);
  const [syncWarning, setSyncWarning] = useState("");
  const [toast, setToast] = useState(null);
  const [focusedMatchId, setFocusedMatchId] = useState(null);
  const [darkMode, setDarkMode] = useState(
    () => window.localStorage.getItem("bet-pl-theme") === "dark",
  );

  const notify = useCallback((message, type = "success") => {
    setToast({ message, type });
    window.setTimeout(() => setToast(null), 3500);
  }, []);

  const loadMatches = useCallback(async () => {
    const result = await api("/api/matches");
    setMatches(result.matches);
    setSyncWarning(result.syncWarning || "");
  }, []);

  const refreshMe = useCallback(async () => {
    const result = await api("/api/auth/me");
    setUser(result.user);
  }, []);

  const loadCurrentTab = useCallback(
    async (currentTab, currentUser) => {
      if (currentTab === "dashboard") await loadMatches();
      if (currentTab === "bets") setBets((await api("/api/bets")).bets);
      if (currentTab === "leaderboard")
        setLeaders((await api("/api/leaderboard")).users);
      if (currentTab === "admin" && currentUser?.role === "ADMIN") {
        const [usersResult] = await Promise.all([
          api("/api/admin/users"),
          loadMatches(),
        ]);
        setAdminUsers(usersResult.users);
      }
    },
    [loadMatches],
  );

  useEffect(() => {
    api("/api/auth/me")
      .then((result) => setUser(result.user))
      .catch(() => setUser(null))
      .finally(() => setAuthLoading(false));
  }, []);

  useEffect(() => {
    window.localStorage.setItem("bet-pl-theme", darkMode ? "dark" : "light");
  }, [darkMode]);

  useEffect(() => {
    const expire = () => {
      setUser(null);
      setTab("dashboard");
    };
    window.addEventListener("matchpot:session-expired", expire);
    return () => window.removeEventListener("matchpot:session-expired", expire);
  }, []);

  useEffect(() => {
    if (!user) return;
    loadCurrentTab(tab, user).catch((error) => notify(error.message, "error"));
  }, [user?.id, tab, loadCurrentTab, notify]);

  async function onSaved(balance) {
    setUser((current) => ({ ...current, balance }));
    await loadMatches();
  }

  async function reloadAdmin() {
    await Promise.all([
      loadMatches(),
      refreshMe(),
      api("/api/admin/users").then((result) => setAdminUsers(result.users)),
    ]);
  }

  async function logout() {
    await api("/api/auth/logout", { method: "POST" });
    setUser(null);
    setTab("dashboard");
  }

  const navItems = useMemo(
    () => [
      ["dashboard", "경기 보드"],
      ["bets", "내 베팅"],
      ["leaderboard", "순위표"],
      ...(user?.role === "ADMIN" ? [["admin", "운영 센터"]] : []),
    ],
    [user?.role],
  );

  if (authLoading)
    return (
      <div className="splash">
        <span className="brand-mark">BP</span>
      </div>
    );
  if (!user) return <Login onLogin={setUser} />;

  return (
    <div className={`app-shell ${darkMode ? "dark-mode" : ""}`}>
      <header className="topbar">
        <button
          className="brand brand-button"
          onClick={() => setTab("dashboard")}
        >
          <span className="brand-mark">BP</span>
          <span>
            <strong>BET-PL</strong>
          </span>
        </button>
        <nav aria-label="주 메뉴">
          {navItems.map(([key, label]) => (
            <button
              key={key}
              className={tab === key ? "active" : ""}
              onClick={() => setTab(key)}
            >
              {label}
            </button>
          ))}
        </nav>
        <div className="account">
          <span>
            <small>{user.role === "ADMIN" ? "ADMIN" : "PLAYER"}</small>
            <strong>{user.username}</strong>
          </span>
          <b>{formatPoint(user.balance)}</b>
          <button
            className="theme-toggle"
            type="button"
            aria-label={darkMode ? "기본 모드로 전환" : "다크 모드로 전환"}
            aria-pressed={darkMode}
            onClick={() => setDarkMode((current) => !current)}
          >
            <span aria-hidden="true">{darkMode ? "☀" : "☾"}</span>
          </button>
          <button className="logout" onClick={logout} aria-label="로그아웃">
            ↗
          </button>
        </div>
      </header>
      {syncWarning && (
        <div className="warning-bar">
          일정 갱신 실패 · 저장된 데이터를 표시합니다.{" "}
          <span>{syncWarning}</span>
        </div>
      )}
      <main className="content">
        {tab === "dashboard" && (
          <Dashboard
            matches={matches}
            user={user}
            onSaved={onSaved}
            notify={notify}
            focusedMatchId={focusedMatchId}
            onFocusHandled={setFocusedMatchId}
          />
        )}
        {tab === "bets" && (
          <BetHistory
            bets={bets}
            onEdit={(matchId) => {
              setFocusedMatchId(matchId);
              setTab("dashboard");
            }}
          />
        )}
        {tab === "leaderboard" && (
          <Leaderboard users={leaders} currentUser={user} />
        )}
        {tab === "admin" && user.role === "ADMIN" && (
          <Admin
            users={adminUsers}
            matches={matches}
            currentUser={user}
            reload={reloadAdmin}
            notify={notify}
          />
        )}
      </main>
      <footer className="site-footer">
        <span>BET-PL · INTERNAL USE ONLY</span>
        <span>Asia/Seoul · 모든 포인트는 현금 가치가 없습니다.</span>
      </footer>
      {toast && (
        <div className={`toast toast-${toast.type}`} role="status">
          {toast.message}
        </div>
      )}
    </div>
  );
}
