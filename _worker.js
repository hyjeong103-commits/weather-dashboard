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
    // 참고: 도로 CCTV는 ITS가 9443 포트 + HTTP 전용 스트림만 제공해
    // 프록시/임베드가 불가능하므로, 화면에서 공식 CCTV 지도를 새 창으로 연다.
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
