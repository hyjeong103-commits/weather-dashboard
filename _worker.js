// Cloudflare Workers(정적 자산) 진입점
//  - /api/weather 요청은 기상청 API 프록시(키는 KMA_KEY 환경변수)
//  - 그 외 요청은 정적 파일(index.html, mobile.html 등)로 서빙
const ALLOWED = {
  vilage:  'VilageFcstInfoService_2.0/getVilageFcst',
  midLand: 'MidFcstInfoService/getMidLandFcst',
  midTa:   'MidFcstInfoService/getMidTa',
};
const SAFE = ['pageNo','numOfRows','base_date','base_time','nx','ny','regId','tmFc'];

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    // CCTV 목록 — ITS 홈페이지가 쓰는 내부 API(443 포트)를 그대로 사용한다.
    // 인증키가 필요 없고, XSRF 토큰만 먼저 받아 오면 된다.
    if (url.pathname === '/api/cctv') {
      const minX = parseFloat(url.searchParams.get('minX'));
      const maxX = parseFloat(url.searchParams.get('maxX'));
      const minY = parseFloat(url.searchParams.get('minY'));
      const maxY = parseFloat(url.searchParams.get('maxY'));
      if ([minX, maxX, minY, maxY].some((v) => Number.isNaN(v))) {
        return json({ error: '좌표 범위가 필요합니다' }, 400);
      }
      const cacheKey = new Request(`https://cache.local/cctv?${minX},${maxX},${minY},${maxY}`);
      const cache = caches.default;
      const hit = await cache.match(cacheKey);
      if (hit) return hit;

      try {
        const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)';
        // ITS는 Cloudflare에서 HTTPS 인증서 검증에 실패(526)할 수 있어 여러 경로를 차례로 시도한다.
        const BASES = ['http://www.its.go.kr', 'https://its.go.kr', 'https://www.its.go.kr'];
        let r1 = null, base = '', why = '';
        for (const b of BASES) {
          try {
            const t = await fetch(b + '/map/cctv', { headers: { 'user-agent': UA }, redirect: 'follow' });
            if (t.status < 500) { r1 = t; base = b; break; }
            why = b + '→' + t.status;
          } catch (e) { why = b + '→' + String(e).slice(0, 40); }
        }
        if (!r1) return json({ error: 'ITS 연결 실패 (' + why + ')' }, 502);

        // 1) XSRF 토큰 + 세션 쿠키
        const setCookies = typeof r1.headers.getSetCookie === 'function'
          ? r1.headers.getSetCookie()
          : (r1.headers.get('set-cookie') ? [r1.headers.get('set-cookie')] : []);
        let token = '', cookie = '';
        for (const c of setCookies) {
          const kv = c.split(';')[0];
          cookie += (cookie ? '; ' : '') + kv;
          const m = kv.match(/^XSRF-TOKEN=(.*)$/);
          if (m) token = decodeURIComponent(m[1]);
        }
        // 2) 전국 CCTV 목록 (토큰을 받은 것과 같은 경로로 요청해야 세션이 유지된다)
        const r2 = await fetch(base + '/map/getMarkers', {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'accept': 'application/json',
            'x-xsrf-token': token,
            'x-requested-with': 'XMLHttpRequest',
            'cookie': cookie,
            'user-agent': UA,
            'referer': base + '/map/cctv',
          },
          body: JSON.stringify({ body: { data: { type: 'CCTV' } } }),
        });
        if (!r2.ok) return json({ error: `ITS 응답 오류 ${r2.status} (경로 ${base}, 토큰 ${token ? '있음' : '없음'})` }, 502);
        const data = await r2.json();
        const feats = data.features || [];
        // 3) 요청 범위 안의 카메라만 추려서 가볍게 반환
        const out = [];
        for (const f of feats) {
          const c = f.geometry && f.geometry.coordinates;
          if (!c) continue;
          const [x, y] = c;
          if (x < minX || x > maxX || y < minY || y > maxY) continue;
          let info;
          try { info = JSON.parse(f.properties.INFO); } catch (e) { continue; }
          const src = info.webUrl || info.appUrl;
          if (!src) continue;
          out.push({ name: info.instlLcDc || 'CCTV', x, y, url: src });
          if (out.length >= 40) break;
        }
        const res = new Response(JSON.stringify({ data: out }), {
          headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'public, max-age=180' },
        });
        ctx.waitUntil(cache.put(cacheKey, res.clone()));
        return res;
      } catch (e) {
        return json({ error: 'CCTV 목록 조회 실패: ' + String(e) }, 502);
      }
    }

    // CCTV 영상 중계 — 원본이 HTTP(80포트)라 HTTPS 페이지에서 직접 재생할 수 없어 여기서 감싼다.
    // HLS 재생목록(m3u8) 안의 세그먼트 주소도 이 경로를 거치도록 다시 쓴다.
    if (url.pathname === '/api/stream') {
      const target = url.searchParams.get('u') || '';
      if (!/^https?:\/\/cctvsec\.ktict\.co\.kr(\/|:)/.test(target)) {
        return json({ error: '허용되지 않은 주소입니다' }, 400);
      }
      try {
        const r = await fetch(target, { headers: { 'user-agent': 'Mozilla/5.0', 'referer': 'http://www.its.go.kr/' } });
        if (!r.ok) return json({ error: '영상 서버 응답 오류 ' + r.status }, 502);
        const buf = await r.arrayBuffer();
        const head = new TextDecoder().decode(buf.slice(0, 16));
        // 재생목록이면 내부 주소 재작성
        if (head.startsWith('#EXTM3U')) {
          const base = target.slice(0, target.lastIndexOf('/') + 1);
          const text = new TextDecoder().decode(buf)
            .split('\n')
            .map((line) => {
              const s = line.trim();
              if (!s || s.startsWith('#')) return line;
              const abs = /^https?:\/\//.test(s) ? s : base + s;
              return '/api/stream?u=' + encodeURIComponent(abs);
            })
            .join('\n');
          return new Response(text, {
            headers: {
              'content-type': 'application/vnd.apple.mpegurl',
              'access-control-allow-origin': '*',
              'cache-control': 'no-store',
            },
          });
        }
        // 영상 조각(ts) 등은 그대로 전달
        return new Response(buf, {
          headers: {
            'content-type': r.headers.get('content-type') || 'video/mp2t',
            'access-control-allow-origin': '*',
            'cache-control': 'public, max-age=10',
          },
        });
      } catch (e) {
        return json({ error: '영상 중계 실패: ' + String(e) }, 502);
      }
    }
    if (url.pathname === '/api/weather') {
      const KEY = env.KMA_KEY;
      if (!KEY) return json({ error: 'KMA_KEY 환경변수가 설정되지 않았습니다' }, 500);
      const path = ALLOWED[url.searchParams.get('service')];
      if (!path) return json({ error: 'invalid service' }, 400);
      const qs = new URLSearchParams({ serviceKey: KEY, dataType: 'JSON' });
      for (const k of SAFE) { const v = url.searchParams.get(k); if (v != null) qs.set(k, v); }
      try {
        const r = await fetch(`https://apis.data.go.kr/1360000/${path}?${qs}`);
        return new Response(await r.text(), {
          status: 200,
          headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'public, max-age=600' },
        });
      } catch (e) {
        return json({ error: String(e) }, 502);
      }
    }
    // 정적 파일
    return env.ASSETS.fetch(request);
  },
};

function json(obj, status) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
}
