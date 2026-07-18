// 기상청 API 프록시 — Cloudflare Pages Functions 버전
const ALLOWED = {
  vilage:  'VilageFcstInfoService_2.0/getVilageFcst',
  midLand: 'MidFcstInfoService/getMidLandFcst',
  midTa:   'MidFcstInfoService/getMidTa',
};
const SAFE = ['pageNo','numOfRows','base_date','base_time','nx','ny','regId','tmFc'];

export async function onRequestGet(context) {
  const KEY = context.env.KMA_KEY;
  if (!KEY) return err('KMA_KEY 환경변수가 설정되지 않았습니다', 500);

  const url = new URL(context.request.url);
  const path = ALLOWED[url.searchParams.get('service')];
  if (!path) return err('invalid service', 400);

  const qs = new URLSearchParams({ serviceKey: KEY, dataType: 'JSON' });
  for (const k of SAFE) {
    const v = url.searchParams.get(k);
    if (v != null) qs.set(k, v);
  }

  try {
    const r = await fetch(`https://apis.data.go.kr/1360000/${path}?${qs}`);
    const body = await r.text();
    return new Response(body, {
      status: 200,
      headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'public, max-age=600' },
    });
  } catch (e) {
    return err(String(e), 502);
  }
}

function err(message, status) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
}
