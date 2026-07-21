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
  async fetch(request, env) {
    const url = new URL(request.url);
    // 프론트에 필요한 설정값 (CCTV 목록 프록시 주소)
    if (url.pathname === '/api/config') {
      return new Response(JSON.stringify({ cctvApi: env.CCTV_API || '' }), {
        status: 200,
        headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'public, max-age=300' },
      });
    }

    // CCTV 영상 중계 — 원본이 HTTP(80포트)라 HTTPS 페이지에서 직접 재생할 수 없어 여기서 감싼다.
    // HLS 재생목록(m3u8) 안의 세그먼트 주소도 이 경로를 거치도록 다시 쓴다.
    if (url.pathname === '/api/stream') {
      const target = url.searchParams.get('u') || '';
      if (!/^https?:\/\/cctvsec\.ktict\.co\.kr(\/|:)/.test(target)) {
        return json({ error: '허용되지 않은 주소입니다' }, 400);
      }
      try {
        const r = await fetch(target, { headers: { 'user-agent': 'Mozilla/5.0', 'referer': 'https://www.its.go.kr/' } });
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
